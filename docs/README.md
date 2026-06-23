# Argsbarg documentation

Start here to pick the right guide.

| If you are… | Read |
| --- | --- |
| **New to argsbarg** | [../README.md](../README.md) — install, minimal usage, public API |
| **Authoring a `CliProgram`** (humans or agents) | [cli-program.md](cli-program.md) — schema, formats, headless, `read*Flags` |
| **Exposing MCP tools** | [mcp.md](mcp.md) — stdio server, `inputSchema`, varargs, `install --mcp` |
| **Shipping install / completions / skills** | [install.md](install.md) — `myapp install`, shell completions |
| **Bundling `myapp docs` topics** | [bundled-docs.md](bundled-docs.md) — consumer docgen vs framework docs |
| **Agent skills** | [ai-skills.md](ai-skills.md) — `install --skill`, `docs skill` |
| **Maintaining the argsbarg repo** | [developing.md](developing.md) — release, consumers, npm `files` |
| **Cursor / IDE agents in a consumer app** | Copy [templates/cursor/rules/cli-program.mdc](templates/cursor/rules/cli-program.mdc) to `.cursor/rules/` |

## Framework docs vs consumer docgen

| Source | What it is | Where it lives |
| --- | --- | --- |
| **Framework docs** | How argsbarg works; authoring conventions | This directory — shipped in `node_modules/argsbarg/docs/` after `bun add argsbarg` |
| **Consumer docgen** | *Your* command tree, API, MCP guide for *your* app | `myapp docs api`, `docs schema`, `docs mcp` — written to `./docs/` with `--save` |
| **Cursor rule** | Thin tripwire telling agents to read framework docs | `node_modules/argsbarg/docs/templates/cursor/rules/cli-program.mdc` — copy into your repo and append app conventions |

Agents do **not** load `node_modules/argsbarg/docs/` unless your repo references them (Cursor rule, `AGENTS.md`, or an `alwaysApply` project rule). Generated `./docs/api.md` in a consumer repo describes **your** CLI, not argsbarg itself.

## Examples

| Example | Shows |
| --- | --- |
| [../examples/minimal.ts](../examples/minimal.ts) | Presence + string flags, fallback routing |
| [../examples/nested.ts](../examples/nested.ts) | Nested commands, varargs, MCP + `docs` |
| [../examples/formats.ts](../examples/formats.ts) | `CliValueFormat`, `default`, `readLeafInputs()` |
