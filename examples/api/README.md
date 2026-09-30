# example-api

Argsbarg schema-first npm template (Zod schemas, typed commands, REST CRUD).

## Installation

```bash
npx example-api --help
# or
npm install -g example-api
```

Requires Node ≥ 22.13 (`node:sqlite`). Shell completions: `example-api completion zsh --help` (also bash and fish).

## Commands

- `example-api echo` — Echo text back to stdout or inspect flags.
- `example-api render-json` — Process structured JSON payloads with schema validation.
- `example-api shape-area` — Discriminated-union JSON input (MCP clients see it wrapped as `{ input }`).
- `example-api status` — Show application version with a Zod output schema (`--json`).
- `example-api workspaces` — Manage workspace resources (REST CRUD with in-memory SQLite).

### Built-in commands

- `example-api completion` — Print shell tab-completion scripts (bash, zsh, fish).
- `example-api http` — Start the HTTP API server.
- `example-api mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `example-api version` — Display version information.

## Usage

```bash
# Print a message
example-api echo "Hello, world!"

# Inspect JSON status
example-api status --json

# Workspaces over HTTP (the in-memory database lives in the server process)
example-api http &
curl -s localhost:3000/workspaces

# Start the MCP server for AI agents
example-api mcp
```

## AI Agent & MCP Integration

`example-api` includes an MCP server and an agent skill:

- **MCP server**: add `{ "command": "npx", "args": ["-y", "example-api", "mcp"] }` to your client's MCP config.
- **Agent skill**: See `skills/example-api/SKILL.md` for agent command group instructions.


## Development

Requires Node ≥ 22.18 and [just](https://just.systems):

```bash
just setup             # npm install
just test              # Biome, tsc, node --test
just run --help        # from source
just build             # tsc → dist/ (+ SQL migrations)
just release patch --dry-run
```
