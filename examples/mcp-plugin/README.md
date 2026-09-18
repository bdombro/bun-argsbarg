# mcp-plugin

Argsbarg MCP plugin template for Cursor and Claude Code marketplaces (@sg schemagen, JSON schemas, in-repo manifests).

## Overview

`mcp-plugin` packages an MCP server and agent skills directly for Cursor and Claude Code marketplaces:

- **Cursor Plugin**: `.cursor-plugin/plugin.json` and `mcp.json` running `${CURSOR_PLUGIN_ROOT}/scripts/mcp.mjs` via `node`.
- **Claude Code Plugin**: `.claude-plugin/plugin.json` and `.mcp.json` running `${CLAUDE_PLUGIN_ROOT}/scripts/mcp.mjs` via `node`.
- **In-repo skills**: `skills/mcp-plugin/SKILL.md` discovered and loaded by agent platforms.
- **Standalone runner**: `bun build --target=node src/index.ts --outfile scripts/mcp.mjs` creates an inlined, zero-npm-install script.

## Development

```bash
# Install dependencies and generate schemas
just setup

# Build standalone MCP bundle
just build

# Test MCP server directly with node
node ./scripts/mcp.mjs mcp

# Link into local Cursor plugins for live testing
just install-plugin-cursor
```

## Commands

- `mcp-plugin echo` — Echo text back to stdout or inspect flags.
- `mcp-plugin render-json` — Process structured JSON payloads with schema validation.
- `mcp-plugin status` — Show application version with schemagen output schema (`--json`).
- `mcp-plugin workspaces` — Manage workspace resources (REST CRUD with in-memory SQLite).

### Built-in commands

- `mcp-plugin completion` — Install or inspect shell tab completions (bash, zsh, fish).
- `mcp-plugin configure` — Manage agent artifacts (skills, MCP, application configuration).
- `mcp-plugin docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).
- `mcp-plugin mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `mcp-plugin version` — Display version information.

## Distribution & Marketplaces

### Cursor

- **Local Development / Testing**: Run `just install-plugin-cursor` to link the repo into `~/.cursor/plugins/local/mcp-plugin`. Reload the Cursor window to activate.
- **Team Marketplace**: In Cursor Dashboard → **Settings → Plugins → Team Marketplaces → Import**, enter your GitHub repository URL.
- **Official Cursor Marketplace**: Submit your repository URL at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). Once approved, users can install directly via `/add-plugin mcp-plugin` or from the Customize sidebar.

### Claude Code

- **Direct Git Install**: Users can add your repository without central registration:
  ```bash
  /plugin marketplace add <owner>/<repo>
  /plugin install mcp-plugin
  /reload-plugins
  ```
- **Official Directory**: Submit a pull request to [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) under `external_plugins/`. Once merged, users can install directly via `/plugin install mcp-plugin@claude-plugins-official`.

## Documentation

| Need | Resource |
| --- | --- |
| CLI reference | [docs/cli.md](docs/cli.md) or `mcp-plugin docs cli` |
| MCP tools | [docs/mcp.md](docs/mcp.md) or `mcp-plugin docs mcp` |
| HTTP API | [docs/http.md](docs/http.md) or `mcp-plugin docs http` |
| OpenAPI 3.1 | [docs/openapi.json](docs/openapi.json) |
