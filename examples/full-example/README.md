# full-example

Argsbarg **CLI copy template** — production shell without schemagen (not a kitchen-sink product).

For `@sg` schemagen, JSON Schema validation, and REST CRUD patterns, use `examples/full-example-json/` or `argsbarg create --template json`.

## What's in this app

- **Builtins enabled:** CLI, shell completion, `docs`, MCP, HTTP API, `configure`, agent skills
- **Commands:**
  - `echo` — simple flags/positionals (MCP-friendly)
  - `status` — app version with optional `--json` (no `outputSchema`)
- **Tooling:** `just docgen`, Homebrew/just dev workflow (no schemagen)

## Quick start

From a git checkout at this directory (requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh)):

```bash
brew install just bun
just setup
just run status --json
just run docs readme
```
