---
id: example-cli
name: example-cli
description: Operates the example-cli CLI (echo, status). Use when the user mentions example-cli, echo, status, or related tasks.
enabled: true
---

# example-cli

Argsbarg npm CLI template (npx, MCP, HTTP; options and flags only)

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

- **Agent plugin:** plugins built with `example-cli mcp bundle` ship this skill.
- **Manual:** copy or symlink `skills/example-cli/` into your agent's skill directory (for example `~/.agents/skills/example-cli/` or `~/.claude/skills/example-cli/`).
