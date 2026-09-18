# full-example-json

Argsbarg schema-first copy template (@sg schemagen, JSON schemas, REST CRUD).

## Installation

Install via Homebrew:

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install full-example-json
full-example-json configure install
```

`full-example-json configure install` sets up shell completions, agent skills, and MCP configuration.

## Commands

- `full-example-json echo` — Echo text back to stdout or inspect flags.
- `full-example-json render-json` — Process structured JSON payloads with schema validation.
- `full-example-json status` — Show application version with schemagen output schema (`--json`).
- `full-example-json workspaces` — Manage workspace resources (REST CRUD with in-memory SQLite).

### Built-in commands

- `full-example-json completion` — Install or inspect shell tab completions (bash, zsh, fish).
- `full-example-json configure` — Manage agent artifacts (skills, MCP, application configuration).
- `full-example-json docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).
- `full-example-json mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `full-example-json version` — Display version information.

## Usage

```bash
# Print a message
full-example-json echo "Hello, world!"

# Inspect JSON status
full-example-json status --json

# List workspaces
full-example-json workspaces list

# Start the MCP server for AI agents
full-example-json mcp
```

## AI Agent & MCP Integration

`full-example-json` includes an integrated MCP server and agent skills out of the box:

- **MCP server**: Run `full-example-json mcp` or register via `full-example-json configure install`.
- **Agent skill**: See `skills/full-example-json/SKILL.md` for agent router instructions.

## Documentation

| Need | Resource |
| --- | --- |
| CLI reference | [docs/cli.md](docs/cli.md) or `full-example-json docs cli` |
| MCP tools | [docs/mcp.md](docs/mcp.md) or `full-example-json docs mcp` |
| HTTP API | [docs/http.md](docs/http.md) or `full-example-json docs http` |
| Agent skill router | [skills/full-example-json/SKILL.md](skills/full-example-json/SKILL.md) |
| CLI schema (JSON) | [docs/cli-schema.json](docs/cli-schema.json) |

## Development

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh):

```bash
brew install just bun
just setup
just schemagen   # after modifying @sg types in src/
just check
just test
```
