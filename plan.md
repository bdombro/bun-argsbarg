# bun-argsbarg Plan

## Current Status

**Overall**: Core CLI, MCP, install, docs, and `install --update` are complete. Unreleased **4.x** adds the `Cli` class and `program.appConfig` / `ctx.appConfig` config-first model.

### Shipped / in flight

- Schema-driven parsing, help, completions, subcommand routing, fallback commands
- **`Cli` runtime** — `new Cli(program).run()`, `.invoke()`, `.serveMcp()`; eager validation + frozen program
- **`program.appConfig`** — flat JSON config, `entries` metadata, `ctx.appConfig` in handlers
- MCP server (`mcpServer: { enabled: true }`), `ctx.invocation`, headless `.invoke()` for tests
- `install` built-in (`install --update` when `updateGetLatest` is set), agent skills, bundled `docs` (topics, schema, api, skill, mcp)
- Headless helpers and `ghReleaseUpdateGetLatest` for GitHub release consumers

### Consumers

- **qa-cli** — argsbarg program with Ink UI; commands under `src/commands/`
- **idp-trees** — argsbarg program with headless JSON ops; `cli/dispatch.ts` pattern

See [README.md](README.md) and [CHANGELOG.md](CHANGELOG.md) for release history.
