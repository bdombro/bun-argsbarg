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

## Local consumer apps

Sibling consumer repos (machine-specific paths in the root `justfile` `consumer_apps` variable, e.g. `~/dev/ss/sqsp-workspaces`):

| Recipe | When | Effect |
| --- | --- | --- |
| `just consumers-dev` | Before publish; hacking on argsbarg locally | `bun add argsbarg@file:<relative>`; refresh `.cursor/rules/cli-program.mdc` and `code.mdc` from template (keeps app-specific suffix) |
| `just consumers-sync` | After release | Sets `"argsbarg": "^<this package.json version>"`, `bun install`, merge **cli-program** + **code** Cursor rules, `just build`, `just docgen`, `just install-local` (Homebrew dev formula + agent artifacts; `just install` is an alias) |
| `just consumers-schemagen` | After `@sg` type changes in consumers | Runs `argsbarg schemagen` in each `consumer_apps` path (fails if missing) |

`consumers-sync` reads the version from **this repo’s** `package.json` — not npm. Run it **after** `just release` so consumers pin a version that exists on the registry.

**Argsbarg authoring rules** — `scripts/merge-cli-program-rule.ts` and `scripts/merge-code-rule.ts` copy templates from `examples/full-example-json/.cursor/rules/` into each consumer, preserving any existing `**… conventions:**` footer block.

**Recommended in each consumer:** replace template placeholders with `**<app> conventions:**` bullets. Commit those files; merges refresh the shared top, not your footer.

## Upgrading consumer apps to 7.0

Breaking changes (no backward compat). See [CHANGELOG.md](../CHANGELOG.md) `[Unreleased]`.

1. **Schemagen:** replace `export type configType|inputType|outputType` with `/** @sg */` immediately above `export interface` / `export type` (no blank line).
2. **Imports:** `configSchema` → `{AppConfig}Schema` (type name + `Schema`); same for leaf `inputSchema` / `outputSchema` imports (`StatusJsonOutputSchema`, etc.).
3. **Run** `argsbarg schemagen` (or `just schemagen`) after every type change.
4. **HTTP:** use `/api/...` REST routes only (`POST /tools/*` removed).
5. **Hooks:** remove manual `ctx.locals.requestId` in `beforeInvoke` — framework seeds it.
6. **Exports:** stop importing `loadLeafInputs` / `CliHttpResponseConfig` from `argsbarg` (use `ctx.inputs`, leaf `http.successContentType`).
7. **Cursor rules:** `just consumers-dev` merges `cli-program.mdc` + `code.mdc` (includes **Abstractions** needless-extraction rule).
8. **Verify:** `just test` and `just docgen` in each consumer repo.

**Consumer app skill** — `just install-local` in each consumer (part of `consumers-sync`) runs Homebrew dev install then `myapp configure --sync --yes`, which updates `~/.agents/skills/<app>/` when `program.skill.enabled` — not the argsbarg framework rule.

## npm package contents

`npm publish` does **not** honor `.gitignore`. Only paths listed in `package.json` `files` are included in the tarball (plus always-excluded defaults like `node_modules`).

When adding docs or examples intended for consumers, ensure they live under whitelisted paths (`docs/`, `examples/`, `src/`, etc.).

Exclude `examples/full-example/node_modules/` and `examples/full-example-json/node_modules/` from the npm tarball via [`.npmignore`](../.npmignore).

## Copy templates

Both [`examples/full-example/`](../examples/full-example/) (CLI) and [`examples/full-example-json/`](../examples/full-example-json/) (schema-first) must enable every builtin (`capabilities.test.ts`). After builtin or schemagen doc changes:

```bash
just example-full-check
just test
```

See [docs/README.md](README.md) for the full documentation map.

## Advanced imports

Subpath exports (root barrel still re-exports everything):

```typescript
import { Cli, type CliProgram } from "argsbarg/cli";
import { generateOpenApi, httpServeHttp } from "argsbarg/http";
import { packMcpBundle } from "argsbarg/mcp"; // @experimental
import { shouldRunHeadless } from "argsbarg/headless";
import { runSchemagen } from "argsbarg/schemagen";
```

## Module boundaries

| Layer | Role |
| --- | --- |
| `schema.ts`, `parse.ts`, `context.ts` | Transport-agnostic CLI core |
| `http/` | HTTP tool server (`httpServer` capability) |
| `mcp/` | MCP stdio server and bundle (`mcpServer` capability) |
| `configure/artifacts/` | Agent artifact sync (`configure` capability) |
| `docs/` | Built-in documentation generators |

Capabilities are declared on `CliProgram`; builtins wire them in [`src/builtins/`](../src/builtins/).

## Docs

See [README.md](README.md) for the documentation map. Framework authoring guide: [cli-program.md](cli-program.md).
