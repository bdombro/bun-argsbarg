---
id: example-api
name: example-api
description: Operates the example-api CLI (echo, render-json, status, workspaces :id delete, workspaces :id get, and 4 more). Use when the user mentions example-api, echo, render-json, status, or related tasks.
enabled: true
---

# example-api

Argsbarg schema-first npm template (Zod schemas, typed commands, REST CRUD)

## Execution

Invoke via shell:

```bash
example-api <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `example-api <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `example-api --help` at the root for top-level options and command routing.

## Commands

- **`example-api echo`** — Echo a message (MCP-friendly command).
- **`example-api render-json`** — Echo a JSON message (schema-first JSON command demo).
- **`example-api status`** — Show app version.
- **`example-api workspaces :id delete`** — Delete a workspace.
- **`example-api workspaces :id get`** — Get one workspace.
- **`example-api workspaces :id patch`** — Patch a workspace name.
- **`example-api workspaces :id put`** — Replace a workspace.
- **`example-api workspaces get`** — List workspaces.
- **`example-api workspaces post`** — Create a workspace.

## Workflow & Pitfalls

- Always run `example-api <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--yes` for non-interactive execution when confirmation is required.
- Pass `--json` when machine-readable structured output is supported.

## Install location

- **Agent plugin:** plugins built with `example-api mcp bundle` ship this skill.
- **Manual:** copy or symlink `skills/example-api/` into your agent's skill directory (for example `~/.agents/skills/example-api/` or `~/.claude/skills/example-api/`).
