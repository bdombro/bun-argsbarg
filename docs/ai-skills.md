# Agent skills

ArgsBarg CLIs adopt the open repository skill convention (`skills/<app>/SKILL.md`) per the standard at https://dotagentsprotocol.com/.

## Repository skill (`skills/<app>/SKILL.md`)

ArgsBarg CLI templates and `argsbarg create` scaffold an initial `skills/<app>/SKILL.md` directly in the consumer repository. Committing this file allows agents, tools, and skill managers (such as `npx skills add`) to discover and install your CLI's skill directly from the source repository.

Because developers customize `skills/<app>/SKILL.md` with domain workflows, execution tips, and specific examples, skills are **authored artifacts**, not dynamically generated from code. Consumer `just docgen` refreshes only API and schema docs under `./docs/` and never overwrites repository skills.

### Structure of `skills/<app>/SKILL.md`

- **YAML frontmatter** — `id`, `name`, `description`, `enabled` per https://dotagentsprotocol.com
- **Options & Help Discovery** — guides agents to discover arguments and flags just-in-time via `<command> --help`
- **Commands catalog** — compact intent-based router directing agents to the right subcommands
- **Workflow & Pitfalls** — guidelines for automated execution (e.g. using non-interactive flags like `--yes`)

## Claude Code and Cursor plugins

When `mcpServer.claudePlugin: true` and/or `mcpServer.cursorPlugin: true` is configured, running `myapp mcp bundle` packages plugin archives (`dist/claude-plugin/<name>.zip` and `dist/cursor-plugin/<name>.zip`). If a repository skill directory exists (`skills/<key>/`), the package bundles that custom skill; otherwise it falls back to a generated MCP pointer skill that routes agents to the bundled MCP server. These are dist packaging artifacts, not installed via `configure`.

## Uninstalling legacy skills

If an earlier version of an app installed a skill to `~/.agents/skills/<key>/`, running `myapp configure uninstall` cleans up that directory.

See also:

- [Bundled docs](bundled-docs.md) — `docs` config and compile-time imports
- [MCP server](mcp.md) — `mcpServer` config and `mcp` protocol
- [Configure](configure.md) — app config and MCP registration
