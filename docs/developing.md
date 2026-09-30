# Developing argsbarg

Notes for maintainers of this repository.

## Prerequisites

- [Node](https://nodejs.org) ≥ 22.18 and npm (tests run type-stripped `.ts` with `node --test`)
- [Bun](https://bun.sh) only for the `homebrew` template
- [just](https://github.com/casey/just) — `just` lists recipes
- `gh` and `npm` logged in for release

## Day-to-day

```bash
just setup    # npm install
just check    # format + tsc (argsbarg and every template; needs `just examples-install`)
just test     # check + node --test
just build    # tsc → dist/ (JS + .d.ts)
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

To try unreleased argsbarg in another app, run `just build` here, then in the app `npm install --install-links <path to this checkout>`. Reinstall after argsbarg changes, and don't commit the `file:` dependency.

## Upgrading consumer apps past 8.0 (unreleased)

Breaking changes; see the Unreleased section of [CHANGELOG.md](../CHANGELOG.md).

1. **Settings:** remove `appConfig` and `configure` from the app root (startup now rejects them). Move settings into app code (env vars or your own JSON file) and add your own command if users edit them. `ctx.appConfig`, `App.appConfig`, `exportAppConfigSchema()`, `ReadinessContext.appConfig`, and `InvokeHookContext.appConfig` are gone.
2. **Docs:** remove `docs` from the app root (startup rejects it). The `docs` command, generated `cli`/`cli-schema`/`mcp`/`http`/`openapi` docs, `--save`, the `<key>://docs/*` and `<key>://schema` MCP resources, and `schemaResourceUri` are gone. OpenAPI is still served at `GET /openapi.json`. Delete committed generated `docs/*` files and `docgen` recipes.
3. **Install:** `configure install|uninstall|status` and self-update are gone. Ship MCP as an agent plugin or `.mcpb` (`mcp bundle`); document manual client setup (see `docs/mcp.md`).
4. **Readiness:** `GET /health/readiness` reports only the `custom` check (no `config_file` / `config_required`).
5. **Log files:** a relative `log.file` resolves against the working directory, not the app config dir.
6. **Enums:** `OptionKind` / `ValueFormat` / `FallbackMode` / `ParseKind` are `as const` objects; replace type-position uses like `kind: OptionKind.Presence` with `typeof OptionKind.Presence`. Values and `OptionKind.String`-style access are unchanged.
7. **Runtime files:** the package loads `dist/` everywhere (no `bun` export condition, no `src/` in the tarball). For local `file:` development, run `just build` in argsbarg first (npm consumers: `npm install --install-links`).
8. **Removed exports:** `userHome`, `displayAppConfigPath`, `resolveAppConfigPath`, and the `AppConfig*` / `Configure*` / `InstallTarget*` types.
9. **JSON only:** document arguments, document stdin, and HTTP bodies no longer accept YAML.
10. **Skills and `AGENTS.md`:** plugins bundle only the repository skill (`skills/<key>/`); no pointer skill is generated. The `<!-- argsbarg:managed -->` markers and the merge script are gone; your `AGENTS.md` is yours.
11. **Hooks on the CLI:** `app.run()` now calls `hooks.beforeInvoke` / `afterInvoke` / `formatError` / `onError`, as HTTP and MCP already did. Check that CLI commands are fine with what those hooks do.
12. **Help:** plain text with no color or boxes; schemas are printed only when output is piped. Update snapshot tests of help output.

## Upgrading consumer apps to 8.0

Breaking changes; see [CHANGELOG.md](../CHANGELOG.md) for the full migration notes.

1. **Dependencies:** add `zod@^4` to the consumer's `dependencies` (argsbarg's peer).
2. **Schemas:** convert each `/** @sg */` type into a Zod schema plus a same-named type (`export const X = z.strictObject({…}); export type X = z.infer<typeof X>`). Copy every JSDoc into `.describe("…")`, because agents read those descriptions and Zod does not read JSDoc.
3. **Commands:** pass the Zod schemas to `inputSchema` / `outputSchema` / `errorSchema`, wrap every command in `command({ … })` (replacing `satisfies CliLeaf` / `CliRouter`), and build the app with `export const app = argsbarg({ … })` in `src/app.ts` (replacing `satisfies CliProgram` + `new Cli(program)`; `index.ts` becomes `await app.run()`). Rename `ctx.program` / `cli.program` to `ctx.spec` / `app.spec`, and drop the `Cli` prefix from types (see the CHANGELOG table). Replace `ctx.inputsAs<T>()` (removed) with `ctx.inputs`, use `ctx.pathParams` for `:param` command groups, change `kind: "json"` to `kind: "document"`, and drop `skill: { … }` from the app root.
4. **Config:** `appConfig.jsonSchema` → `appConfig.schema` (a Zod object schema).
5. **Imports:** subpath exports (`argsbarg/cli`, `/http`, `/mcp`, `/headless`, `/schemagen`) are removed; import from `"argsbarg"`.
6. **Cleanup:** delete `__generated__/` directories, `schemagen` justfile recipes (and `setup` / `docgen` / `check` dependencies on them), and the `**/__generated__/` gitignore rule. Remove `@cfworker/json-schema` if it was only used alongside argsbarg.
7. **Verify:** `just test`, and compare piped `--help` output (it prints the schemas) before and after. Every description should survive.

Upgrade notes for 7.x and earlier are in [CHANGELOG.md](../CHANGELOG.md).

## npm package contents

`npm publish` does **not** honor `.gitignore`. Only paths listed in `package.json` `files` are included in the tarball (plus always-excluded defaults like `node_modules`).

When adding docs or examples intended for consumers, ensure they live under whitelisted paths (`dist/`, `docs/`, `examples/`, etc.). `src/` is not published; every runtime loads `dist/`.

`files` excludes `examples/**/node_modules` and `examples/**/package-lock.json` with `!` entries (npm ignores the root `.npmignore` when `files` is set).

## Copy templates

The npm templates ([`examples/cli/`](../examples/cli/), [`examples/api/`](../examples/api/), [`examples/agent-plugin/`](../examples/agent-plugin/)) and the Bun [`examples/homebrew/`](../examples/homebrew/) template use `argsbarg: file:../..` in-repo. `cli` and `api` must enable every builtin (`template-capabilities.test.ts`). **`just examples-install`** builds `dist/` and reinstalls them: the npm templates with `npm install --install-links` (argsbarg is packed and installed like a published package, so each example has its own zod), the Homebrew template with `bun install --force`. Rerun it after argsbarg changes; the installed copies don't update live. `just examples-test` runs each template's own suite. After builtin or schema doc changes:

```bash
just example-full-check
just test
```

See the [documentation map](../README.md#documentation).

## Imports and tooling

The package has a single entry point: import everything from `"argsbarg"`. `just build` emits the JS and per-file declarations (`dist/**/*.d.ts`, with declaration maps) from `src/`; consumers only ever see `.d.ts` files, and `exports` exposes only `"."`.

## Module boundaries

| Path | Role |
| --- | --- |
| `src/index.ts` | The only entry point; every public export |
| `src/core/` | Types, argv parsing, validation, `CommandContext`, value formats, the Zod adapter, wire schemas |
| `src/runtime/` | `argsbarg()` / `App` (`run`, `invoke`, serve), capabilities, hooks, help rendering |
| `src/builtins/` | Built-in commands (`version`, `http`, `mcp`) and their dispatch; `completion/` holds the shell scripts |
| `src/headless/` | Headless routing helpers and MCP/HTTP tool-call → argv |
| `src/http/` | HTTP server, routes, OpenAPI, readiness |
| `src/mcp/` | MCP stdio server and tools; `pack/` builds `.mcpb` and plugin zips |
| `src/server/` | Serve config shared by HTTP and MCP |
| `src/log/` | ECS log lines, emitter, trace headers |
| `src/cli-tool/` | The `argsbarg` bin (`create`); uses only the public API (`../index.ts`), like any consumer |
| `src/test/` | Shared fixtures and integration suites |

Capabilities are declared on the app root; builtins wire them in `src/builtins/`.

## Docs

See the [documentation map](../README.md#documentation). Framework authoring guide: [cli-program.md](cli-program.md).
