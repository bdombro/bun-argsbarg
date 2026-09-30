---
id: example-agent-plugin
name: example-agent-plugin
description: Operates the example-agent-plugin CLI (echo, render-json, status, workspaces :id delete, workspaces :id get, and 4 more). Use when the user mentions example-agent-plugin, echo, render-json, status, or related tasks.
enabled: true
---

# example-agent-plugin

Argsbarg MCP plugin template for Cursor and Claude Code marketplaces (Zod schemas, typed commands, REST CRUD)

## Execution

Invoke via shell:

```bash
example-agent-plugin <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `example-agent-plugin <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `example-agent-plugin --help` at the root for top-level options and command routing.

## Commands

- **`example-agent-plugin echo`** — Echo a message (MCP-friendly command).
- **`example-agent-plugin render-json`** — Echo a JSON message (schema-first JSON command demo).
- **`example-agent-plugin status`** — Show app version.
- **`example-agent-plugin workspaces :id delete`** — Delete a workspace.
- **`example-agent-plugin workspaces :id get`** — Get one workspace.
- **`example-agent-plugin workspaces :id patch`** — Patch a workspace name.
- **`example-agent-plugin workspaces :id put`** — Replace a workspace.
- **`example-agent-plugin workspaces get`** — List workspaces.
- **`example-agent-plugin workspaces post`** — Create a workspace.

## Workflow & Pitfalls

- Always run `example-agent-plugin <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--yes` for non-interactive execution when confirmation is required.
- Pass `--json` when machine-readable structured output is supported.

## Install location

Install follows the https://dotagentsprotocol.com:

- Auto-install: `example-agent-plugin configure install` when `skill.enabled` → `~/.agents/skills/example-agent-plugin/`
- Cursor and most coding agents read `~/.agents/skills/` natively

**Claude Code (manual):** symlink or copy into Claude's skill directory:

```bash
mkdir -p ~/.claude/skills
ln -sf ~/.agents/skills/example-agent-plugin ~/.claude/skills/example-agent-plugin
```

Project override (optional): `.agents/skills/example-agent-plugin/`

