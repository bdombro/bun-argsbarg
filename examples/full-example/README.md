# full-example

Argsbarg CLI copy template (MCP, HTTP, configure, skills; no schemagen).

## Installation

Install via Homebrew:

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install full-example
full-example configure install
```

`full-example configure install` sets up shell completions, agent skills, and MCP configuration.

## Commands

- `full-example echo` — Echo text back to stdout or inspect flags.
- `full-example status` — Show application version with optional `--json`.

### Built-in commands

- `full-example completion` — Install or inspect shell tab completions (bash, zsh, fish).
- `full-example configure` — Manage agent artifacts (skills, MCP, application configuration).
- `full-example docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).
- `full-example mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `full-example version` — Display version information.

## Usage

```bash
# Print a message
full-example echo "Hello, world!"

# Inspect JSON status
full-example status --json

# Start the MCP server for AI agents
full-example mcp
```

## AI Agent & MCP Integration

`full-example` includes an integrated MCP server and agent skills out of the box:

- **MCP server**: Run `full-example mcp` or register via `full-example configure install`.
- **Agent skill**: See `skills/full-example/SKILL.md` for agent router instructions.

## Documentation

| Need | Resource |
| --- | --- |
| CLI reference | [docs/cli.md](docs/cli.md) or `full-example docs cli` |
| MCP tools | [docs/mcp.md](docs/mcp.md) or `full-example docs mcp` |
| HTTP API | [docs/http.md](docs/http.md) or `full-example docs http` |
| Agent skill router | [skills/full-example/SKILL.md](skills/full-example/SKILL.md) |
| CLI schema (JSON) | [docs/cli-schema.json](docs/cli-schema.json) |

## Development

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh):

```bash
brew install just bun
just setup
just check
just test
```
