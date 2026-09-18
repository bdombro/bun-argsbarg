---
id: mcp-plugin
name: mcp-plugin
description: Operates the mcp-plugin CLI (echo, render-json, status, workspaces :id delete, workspaces :id get, and 4 more). Use when the user mentions mcp-plugin, echo, render-json, status, or related tasks.
enabled: true
---

# mcp-plugin

Argsbarg MCP plugin template for Cursor and Claude Code marketplaces (@sg schemagen, JSON schemas, REST CRUD)

## Execution

Invoke via shell:

```bash
mcp-plugin <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `mcp-plugin <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `mcp-plugin --help` at the root for top-level options and command routing.

## Commands

- **`mcp-plugin echo`** — Echo a message (MCP-friendly leaf).
- **`mcp-plugin render-json`** — Echo a JSON message (schema-first JSON leaf demo).
- **`mcp-plugin status`** — Show app version.
- **`mcp-plugin workspaces :id delete`** — Delete a workspace.
- **`mcp-plugin workspaces :id get`** — Get one workspace.
- **`mcp-plugin workspaces :id patch`** — Patch a workspace name.
- **`mcp-plugin workspaces :id put`** — Replace a workspace.
- **`mcp-plugin workspaces get`** — List workspaces.
- **`mcp-plugin workspaces post`** — Create a workspace.

## Workflow & Pitfalls

- Always run `mcp-plugin <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--yes` for non-interactive execution when confirmation is required.
- Pass `--json` when machine-readable structured output is supported.

## Install location

Install follows the https://dotagentsprotocol.com:

- Auto-install: `mcp-plugin configure install` when `skill.enabled` → `~/.agents/skills/mcp-plugin/`
- Cursor and most coding agents read `~/.agents/skills/` natively

**Claude Code (manual):** symlink or copy into Claude's skill directory:

```bash
mkdir -p ~/.claude/skills
ln -sf ~/.agents/skills/full-example-json ~/.claude/skills/full-example-json
```

Project override (optional): `.agents/skills/full-example-json/`

