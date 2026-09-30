# Developing argsbarg

Notes for maintainers of this repository. Also shipped under `node_modules/argsbarg/docs/` for fork maintainers.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [just](https://github.com/casey/just) — `just` lists recipes
- `gh` and `npm` logged in for release

## Day-to-day

```bash
just check    # typecheck + format
just test     # check + unit tests
just typegen  # regenerate index.d.ts
```

## Release

```bash
just release patch   # or minor | major
```

The release script bumps `package.json`, promotes `[Unreleased]` in `CHANGELOG.md`, commits, tags, pushes, creates a GitHub release, and publishes to npm. Run `just test` first (the `just release` recipe does).

Update `CHANGELOG.md` under `[Unreleased]` before releasing.

## Cursor test hook (optional)

Copy templates and the argsbarg repo root include `.cursor/hooks.json` plus `.cursor/hooks/run-tests-on-stop.ts`. On agent **stop** (completed turn), when git shows changes to `justfile` or `*.{ts,tsx,js,jsx}` (excluding `node_modules/`, `dist/`, `.cursor/`), the hook runs `just test`. Failures return a `followup_message` (up to **20** auto-retries via `loop_limit`). Requires [Cursor hooks](https://cursor.com/docs/hooks); not part of `AGENTS.md`. New projects get hooks via `argsbarg create`.

## Local consumer apps

Sibling consumer repos (machine-specific paths in the root `justfile` `consumer_apps` variable, e.g. `~/dev/ss/sqsp-workspaces`):

| Recipe | When | Effect |
| --- | --- | --- |
| `just consumers-dev` | Before publish; hacking on argsbarg locally | Clears `examples/*/node_modules`, then per consumer: `bun add argsbarg@file:<relative> --force`, `bun add zod@^4`, removes the nested dev `zod`, fixes `.bin/argsbarg`, refreshes `AGENTS.md` from the template (preserves app-specific sections). Run `just examples-install` afterwards. |
| `just consumers-sync` | After release | Sets `"argsbarg": "^<this package.json version>"`, `bun install`, merge `AGENTS.md`, `just build`, `just docgen`, `just install-local` (Homebrew dev formula + agent artifacts; `just install` is an alias) |

`consumers-sync` reads the version from **this repo’s** `package.json` — not npm. Run it **after** `just release` so consumers pin a version that exists on the registry.

**Argsbarg authoring rules** — `scripts/merge-agents-md.ts` copies the template from `examples/api/AGENTS.md` into each consumer. The framework baseline is placed at the top, and all app-specific sections live below `<!-- /argsbarg:managed -->` where they take precedence over framework defaults.

**Recommended in each consumer:** replace template placeholders under `## App conventions` with project-specific bullets. Commit `AGENTS.md`; merges refresh the managed section, not your app-specific sections.

## Upgrading consumer apps to 8.0

Breaking changes; see [CHANGELOG.md](../CHANGELOG.md) for the full migration notes.

1. **Dependencies:** add `zod@^4` to the consumer's `dependencies` (argsbarg's peer).
2. **Schemas:** convert each `/** @sg */` type into a Zod schema plus a same-named type (`export const X = z.strictObject({…}); export type X = z.infer<typeof X>`). Copy every JSDoc into `.describe("…")`, because agents read those descriptions and Zod does not read JSDoc.
3. **Commands:** pass the Zod schemas to `inputSchema` / `outputSchema` / `errorSchema`, wrap every command in `command({ … })` (replacing `satisfies CliLeaf` / `CliRouter`), and build the app with `export const app = argsbarg({ … })` in `src/app.ts` (replacing `satisfies CliProgram` + `new Cli(program)`; `index.ts` becomes `await app.run()`). Rename `ctx.program` / `cli.program` to `ctx.spec` / `app.spec`, and drop the `Cli` prefix from types (see the CHANGELOG table). Replace `ctx.inputsAs<T>()` (removed) with `ctx.inputs`, use `ctx.pathParams` for `:param` command groups, change `kind: "json"` to `kind: "document"`, and drop `skill: { … }` from the app root.
4. **Config:** `appConfig.jsonSchema` → `appConfig.schema` (a Zod object schema).
5. **Imports:** subpath exports (`argsbarg/cli`, `/http`, `/mcp`, `/headless`, `/schemagen`) are removed; import from `"argsbarg"`.
6. **Cleanup:** delete `__generated__/` directories, `schemagen` justfile recipes (and `setup` / `docgen` / `check` dependencies on them), and the `**/__generated__/` gitignore rule. Remove `@cfworker/json-schema` if it was only used alongside argsbarg.
7. **Verify:** `just test`, `just docgen`, and compare `docs/cli-schema.json` before and after. Every description should survive.

## Upgrading consumer apps to 7.0

Breaking changes (no backward compat). See [CHANGELOG.md](../CHANGELOG.md) `[Unreleased]`.

1. **Schemagen:** replace `export type configType|inputType|outputType` with `/** @sg */` immediately above `export interface` / `export type` (no blank line).
2. **Imports:** `configSchema` → `{AppConfig}Schema` (type name + `Schema`); same for leaf `inputSchema` / `outputSchema` imports (`StatusJsonOutputSchema`, etc.).
3. **Run** `argsbarg schemagen` (or `just schemagen`) after every type change.
4. **HTTP:** use `/api/...` REST routes only (`POST /tools/*` removed).
5. **Hooks:** remove manual `ctx.locals.requestId` in `beforeInvoke` — framework seeds it.
6. **Exports:** stop importing `loadLeafInputs` / `CliHttpResponseConfig` from `argsbarg` (use `ctx.inputs`, leaf `http.successContentType`).
7. **Agent instructions:** `just consumers-dev` merges `AGENTS.md` + `CLAUDE.md` (includes **Abstractions** needless-extraction rule).
8. **Verify:** `just test` and `just docgen` in each consumer repo.

**Consumer app skill** — `just install-local` in each consumer (part of `consumers-sync`) runs Homebrew dev install then `myapp configure install`, which updates `~/.agents/skills/<app>/` when `program.skill.enabled` — not the argsbarg framework rule.

## npm package contents

`npm publish` does **not** honor `.gitignore`. Only paths listed in `package.json` `files` are included in the tarball (plus always-excluded defaults like `node_modules`).

When adding docs or examples intended for consumers, ensure they live under whitelisted paths (`docs/`, `examples/`, `src/`, etc.).

Exclude `examples/cli/node_modules/` and `examples/api/node_modules/` from the npm tarball via [`.npmignore`](../.npmignore).

## Copy templates

Both [`examples/cli/`](../examples/cli/) (CLI) and [`examples/api/`](../examples/api/) (schema-first) use `argsbarg: file:../..` in-repo; `just setup` fixes the Bun `.bin/argsbarg` symlink. They must enable every builtin (`capabilities.test.ts`). Bun installs `file:` dependencies as per-file symlinks (edits show up live) from a cached snapshot, so after adding, deleting, or renaming argsbarg files — or after `just consumers-dev` / gdocsmith's `just argsbarg-local`, which clear them — run **`just examples-install`**. It reinstalls all three examples with `--force` (a stale cache fails with `ENOENT … failed copying files from cache`) and removes the nested copies a `file:` install drags along (other examples' `node_modules`, argsbarg's dev `zod`). After builtin or schema doc changes:

```bash
just example-full-check
just test
```

See [docs/README.md](README.md) for the full documentation map.

## Imports and tooling

The package has a single entry point: import everything from `"argsbarg"`. Public types ship in the bundled `index.d.ts` (`just typegen`, via dts-bundle-generator), so consumers never type-check argsbarg's source. dts-bundle-generator 9.5.1 crashes on TypeScript 7, so keep argsbarg's own `typescript` devDependency on `^5.9`. Consumers can use any TypeScript version.

## Module boundaries

| Layer | Role |
| --- | --- |
| `schema.ts`, `parse.ts`, `context.ts` | Transport-agnostic CLI core |
| `http/` | HTTP tool server (`httpServer` capability) |
| `mcp/` | MCP stdio server and bundle (`mcpServer` capability) |
| `configure/artifacts/` | Agent artifact install/refresh (`configure` capability) |
| `docs/` | Built-in documentation generators |

Capabilities are declared on `Program`; builtins wire them in [`src/builtins/`](../src/builtins/).

## Docs

See [README.md](README.md) for the documentation map. Framework authoring guide: [cli-program.md](cli-program.md).
