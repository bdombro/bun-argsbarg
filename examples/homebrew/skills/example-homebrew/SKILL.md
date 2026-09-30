---
id: example-homebrew
name: example-homebrew
description: Operates the example-homebrew CLI (echo, status). Use when the user mentions example-homebrew, echo, status, or related tasks.
enabled: true
---

# example-homebrew

Argsbarg Homebrew CLI template (Bun-compiled binary, formula, tap)

## Execution

Invoke via shell:

```bash
example-homebrew <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `example-homebrew <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `example-homebrew --help` at the root for top-level options and command routing.

## Commands

- **`example-homebrew echo`** — Echo a message (MCP-friendly command).
- **`example-homebrew status`** — Show app version.

## Workflow & Pitfalls

- Always run `example-homebrew <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--yes` for non-interactive execution when confirmation is required.
- Pass `--json` when machine-readable structured output is supported.

## Install location


- **Manual:** copy or symlink `skills/example-homebrew/` into your agent's skill directory (for example `~/.agents/skills/example-homebrew/` or `~/.claude/skills/example-homebrew/`).
