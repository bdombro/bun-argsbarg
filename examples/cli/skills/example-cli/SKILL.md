---
id: example-cli
name: example-cli
description: Operates the example-cli CLI (echo, status). Use when the user mentions example-cli, echo, status, or related tasks.
enabled: true
---

# example-cli

Argsbarg CLI copy template (MCP, HTTP, configure, skills; options and flags only)

## Execution

Invoke via shell:

```bash
example-cli <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `example-cli <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `example-cli --help` at the root for top-level options and command routing.

## Commands

- **`example-cli echo`** — Echo a message (MCP-friendly command).
- **`example-cli status`** — Show app version.

## Workflow & Pitfalls

- Always run `example-cli <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--yes` for non-interactive execution when confirmation is required.
- Pass `--json` when machine-readable structured output is supported.

## Install location

Install follows the https://dotagentsprotocol.com:

- Auto-install: `example-cli configure install` when `skill.enabled` → `~/.agents/skills/example-cli/`
- Cursor and most coding agents read `~/.agents/skills/` natively

**Claude Code (manual):** symlink or copy into Claude's skill directory:

```bash
mkdir -p ~/.claude/skills
ln -sf ~/.agents/skills/example-cli ~/.claude/skills/example-cli
```

Project override (optional): `.agents/skills/example-cli/`

