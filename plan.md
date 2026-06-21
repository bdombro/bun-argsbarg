# bun-argsbarg Plan

## Current Status

**Overall**: Core CLI, MCP, install, docs, and update built-ins are complete. Public API is stable at **3.x**.

### Shipped

- Schema-driven parsing, help, completions, subcommand routing, fallback commands
- MCP server (`mcpServer: { enabled: true }`), `ctx.invocation`, `cliInvoke`
- `install` / `update` built-ins, agent skills, bundled `docs` (topics, schema, api, skill, mcp)
- Headless helpers and `ghReleaseUpdateGetLatest` for GitHub release consumers

### Consumers

- **qa-cli** — argsbarg program with Ink UI; commands under `src/commands/`
- **idp-trees** — argsbarg program with headless JSON ops; `cli/dispatch.ts` pattern

See [README.md](README.md) and [CHANGELOG.md](CHANGELOG.md) for release history.
