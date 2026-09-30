# example-cli

Argsbarg CLI copy template (MCP, HTTP, configure, skills; options and flags only).

## Installation

Install via Homebrew:

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install example-cli
example-cli configure install
```

`example-cli configure install` sets up shell completions, agent skills, and MCP configuration.

## Commands

- `example-cli echo` — Echo text back to stdout or inspect flags.
- `example-cli status` — Show application version with optional `--json`.

### Built-in commands

- `example-cli completion` — Install or inspect shell tab completions (bash, zsh, fish).
- `example-cli configure` — Manage agent artifacts (skills, MCP, application configuration).
- `example-cli docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).
- `example-cli mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `example-cli version` — Display version information.

## Usage

```bash
# Print a message
example-cli echo "Hello, world!"

# Inspect JSON status
example-cli status --json

# Start the MCP server for AI agents
example-cli mcp
```

## AI Agent & MCP Integration

`example-cli` includes an integrated MCP server and agent skills out of the box:

- **MCP server**: Run `example-cli mcp` or register via `example-cli configure install`.
- **Agent skill**: See `skills/example-cli/SKILL.md` for agent command group instructions.

## Documentation

| Need | Resource |
| --- | --- |
| CLI reference | [docs/cli.md](docs/cli.md) or `example-cli docs cli` |
| MCP tools | [docs/mcp.md](docs/mcp.md) or `example-cli docs mcp` |
| HTTP API | [docs/http.md](docs/http.md) or `example-cli docs http` |
| Agent skill command group | [skills/example-cli/SKILL.md](skills/example-cli/SKILL.md) |
| CLI schema (JSON) | [docs/cli-schema.json](docs/cli-schema.json) |

## Development

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh):

```bash
brew install just bun
just setup
just check
just test
```
