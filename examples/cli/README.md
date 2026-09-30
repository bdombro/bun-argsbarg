# example-cli

Argsbarg npm CLI template (npx, MCP, HTTP; options and flags only).

## Installation

Run without installing:

```bash
npx example-cli --help
```

Or install globally:

```bash
npm install -g example-cli
```

Shell completions: `example-cli completion zsh --help` (also bash and fish).

## Commands

- `example-cli echo` — Echo text back to stdout or inspect flags.
- `example-cli status` — Show application version with optional `--json`.

### Built-in commands

- `example-cli completion` — Print shell tab-completion scripts (bash, zsh, fish).
- `example-cli mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.
- `example-cli http` — Start the HTTP API server.
- `example-cli version` — Display version information.

## Usage

```bash
example-cli echo --message "Hello, world!"
example-cli status --json
example-cli mcp
```

## AI Agent & MCP Integration

- **MCP server**: add `{ "command": "npx", "args": ["-y", "example-cli", "mcp"] }` to your client's MCP config.
- **Agent skill**: `skills/example-cli/SKILL.md`; copy it into your agent's skill directory.


## Development

Requires Node ≥ 22.18 and [just](https://just.systems):

```bash
just setup             # npm install
just test              # Biome, tsc, node --test
just run --help        # from source
just build             # tsc → dist/
just release patch --dry-run
```
