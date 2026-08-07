# argsbarg

Always include in context before answering or making changes in this repository:

- [`README.md`](README.md)
- [`docs/*`](docs/)

## Code quality

- Changes must be summarized in CHANGELOG.md under the UNRELEASED section
- JSDocs: Types, interfaces, functions (exported **and** module-private), objects, object properties, classes, class properties, module-level constants, and test `describe`/`test` blocks must have a very human-readable JSDoc directly above the symbol. No exceptions in `src/**` or `scripts/**`. When adding JSDoc to functions, favor putting a JSDoc on each arg instead of using `@param`. Skip comments on short test callbacks and pure re-export files.
- All files should start with a `/* {multi-line description} */` of why the file exists and what it does.
- All imports must be ordered alphabetically by their source module path (the `from` clause).
- Cross-module imports under `src/` use relative paths (`../foo/bar.ts`). Same-directory and child imports use `./`. Keep `.ts` extensions on module files.
- Directory barrels: import `../foo/index.ts` or `./foo/index.ts`; keep `.ts` on non-index module files.
- Explicit exports using the `export { ... } from "..."` or `export type { ... } from "..."` syntax must be ordered alphabetically by their source module path and placed at the top of the file, immediately below the imports.
- Avoid needless extraction: keep single-use helpers in the calling file by default. Split only when reused elsewhere, the caller is large or hard to follow, or extraction clarifies a substantial unit. Do not create tiny one-off helpers.
  - ❌ `utils/formatX.ts` — 60-line helper used by one command
  - ✅ inline helper in that command file

## Examples sync

When changing argsbarg **builtins**, **capabilities**, or **schemagen documentation**:

1. Update **`examples/full-example/`** and **`examples/full-example-json/`** so they still enable every capability (`completion`, `version`, `configure`, `docs`, `mcp`, `http`).
2. Run **`just example-full-check`** from the argsbarg repo root (schemagen + schema git diff + `create --check`).
3. Run **`just test`** — includes `src/cli-tool/full-example-capabilities.test.ts`.

Do not duplicate framework docs here — see [`docs/cli-program.md`](docs/cli-program.md) and consumer [`AGENTS.md`](examples/full-example-json/AGENTS.md).
