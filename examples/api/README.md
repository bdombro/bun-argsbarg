# example-api

Argsbarg schema-first copy template (Zod schemas, typed commands, REST CRUD).

## Installation

Install via Homebrew:

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install example-api
example-api configure install
```

`example-api configure install` sets up shell completions, agent skills, and MCP configuration.

## Commands

- `example-api echo` — Echo text back to stdout or inspect flags.
- `example-api render-json` — Process structured JSON payloads with schema validation.
- `example-api shape-area` — Discriminated-union JSON input (MCP clients see it wrapped as `{ input }`).
- `example-api status` — Show application version with a Zod output schema (`--json`).
- `example-api workspaces` — Manage workspace resources (REST CRUD with in-memory SQLite).

### Built-in commands

- `example-api completion` — Install or inspect shell tab completions (bash, zsh, fish).
- `example-api configure` — Manage agent artifacts (skills, MCP, application configuration).
- `example-api docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).
- `example-api mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `example-api version` — Display version information.

## Usage

```bash
# Print a message
example-api echo "Hello, world!"

# Inspect JSON status
example-api status --json

# List workspaces
example-api workspaces list

# Start the MCP server for AI agents
example-api mcp
```

## AI Agent & MCP Integration

`example-api` includes an integrated MCP server and agent skills out of the box:

- **MCP server**: Run `example-api mcp` or register via `example-api configure install`.
- **Agent skill**: See `skills/example-api/SKILL.md` for agent command group instructions.

## Documentation

| Need | Resource |
| --- | --- |
| CLI reference | [docs/cli.md](docs/cli.md) or `example-api docs cli` |
| MCP tools | [docs/mcp.md](docs/mcp.md) or `example-api docs mcp` |
| HTTP API | [docs/http.md](docs/http.md) or `example-api docs http` |
| Agent skill command group | [skills/example-api/SKILL.md](skills/example-api/SKILL.md) |
| CLI schema (JSON) | [docs/cli-schema.json](docs/cli-schema.json) |

## Development

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh):

```bash
brew install just bun
just setup
just check
just test
```
