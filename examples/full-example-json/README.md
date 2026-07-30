# full-example-json

Argsbarg **schema-first copy template** — `@sg` schemagen, JSON Schema validation, REST CRUD demo (not a kitchen-sink product).

For a CLI-only template without schemagen, use `examples/full-example/` or `argsbarg create --template cli`.

## What's in this app

- **Builtins enabled:** CLI, shell completion, `docs`, MCP, HTTP API, `configure`, agent skills
- **Commands:**
  - `echo` — simple flags/positionals
  - `render-json` — `kind: "json"` leaf, schemagen `inputSchema`, `ctx.inputsAs`
  - `status` — schemagen `outputSchema`, `--json`
  - `workspaces` — REST CRUD, `:id` param routers, verb leaves, schemagen input schemas
- **Tooling:** `@sg` schemagen, `just docgen`, Homebrew/just dev workflow, in-memory SQLite (`bun:sqlite`)

## Quick start

From a git checkout at this directory (requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh)):

```bash
brew install just bun
just setup
just schemagen   # after changing @sg types in src/
just run status --json
just run docs readme
```
