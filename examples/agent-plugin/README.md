# example-agent-plugin

Argsbarg MCP plugin template for Cursor and Claude Code marketplaces (Zod schemas, typed commands, in-repo manifests).

## Overview

`example-agent-plugin` packages an MCP server and agent skills directly for Cursor and Claude Code marketplaces:

- **Cursor Plugin**: inline MCP configuration in `.cursor-plugin/plugin.json` runs `node ${CURSOR_PLUGIN_ROOT}/dist/example-agent-plugin.mjs mcp`.
- **Claude Code Plugin**: inline MCP configuration in `.claude-plugin/plugin.json` runs `node ${CLAUDE_PLUGIN_ROOT}/dist/example-agent-plugin.mjs mcp`.
- **In-repo skills**: `skills/example-agent-plugin/SKILL.md` discovered and loaded by agent platforms.
- **Committed Node bundle**: `dist/example-agent-plugin.mjs` is self-contained (dependencies and schemas bundled), so a fresh clone runs with no install step.

## Installation

Requires Node >=20 on the host's PATH. Nothing is installed at startup; stdout contains only MCP messages. Maintainers need Bun to develop and rebuild the bundle (`just check`).

The in-repo example retains its `argsbarg: file:../..` development dependency. Before distributing a standalone copy, resolve that dependency for the destination repository and regenerate its lockfile; the parent-checkout path is not portable.

### Cursor

Recommended: import directly from GitHub — Cursor Dashboard → **Settings → Plugins → Team Marketplaces → Import**, then enter `https://github.com/bdombro/bun-argsbarg` (subdirectory `examples/agent-plugin` once copied to its own repo). Once published to the [official marketplace](https://cursor.com/marketplace/publish), install via `/add-plugin example-agent-plugin` or the Customize sidebar.

### Claude Code

Recommended: add the GitHub repo as a marketplace, then install:

```bash
/plugin marketplace add <owner>/<repo>
/plugin install example-agent-plugin@example-agent-plugin
```

The marketplace name comes from `.claude-plugin/marketplace.json`, not the repository name.

Once merged into [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official), install via `/plugin install example-agent-plugin@claude-plugins-official`.

## Commands

- `example-agent-plugin echo` — Echo text back to stdout or inspect flags.
- `example-agent-plugin render-json` — Process structured JSON payloads with schema validation.
- `example-agent-plugin status` — Show application version with a Zod output schema (`--json`).
- `example-agent-plugin workspaces` — Manage workspace resources (REST CRUD with in-memory SQLite).

### Built-in commands

- `example-agent-plugin completion` — Install or inspect shell tab completions (bash, zsh, fish).
- `example-agent-plugin configure` — Manage agent artifacts (skills, MCP, application configuration).
- `example-agent-plugin docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).
- `example-agent-plugin mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `example-agent-plugin version` — Display version information.

## Contributing / Local Development

```bash
git clone https://github.com/bdombro/bun-argsbarg.git
cd bun-argsbarg/examples/agent-plugin

# Install dependencies and generate schemas
just setup

# Rebuild the committed Node bundle and run the MCP server from it
just build
node dist/example-agent-plugin.mjs mcp

# Link into local Cursor plugins for live testing
just plugin-cursor-upsert

# Register this checkout as a marketplace and install in Claude Code
just plugin-claude-install
```

Restart Claude Code after installing. Use `bun src/index.ts <command>` for CLI commands from source. Commit `dist/example-agent-plugin.mjs` whenever source changes; `just check` rebuilds it. In-repo development uses `just setup` to repair the local dependency's CLI executable link.

## Documentation

| Need | Resource |
| --- | --- |
| CLI reference | [docs/cli.md](docs/cli.md) or `example-agent-plugin docs cli` |
| MCP tools | [docs/mcp.md](docs/mcp.md) or `example-agent-plugin docs mcp` |
| HTTP API | [docs/http.md](docs/http.md) or `example-agent-plugin docs http` |
| OpenAPI 3.1 | [docs/openapi.json](docs/openapi.json) |
