# Agent skills install

ArgsBarg can install [Agent Skills](https://code.claude.com/docs/en/skills) content for **Cursor** and **Claude Code** from your CLI schema. Each install writes two files:

| File | Purpose |
| --- | --- |
| `SKILL.md` | Frontmatter + command catalog, execution notes, pitfalls |
| `reference.md` | Full `--schema` JSON export |

Skills are **install-only** — there is no print-to-stdout mode, because the artifact is always a two-file directory.

## Quick start

```bash
# Project skill (commit .cursor/skills/ with your repo)
myapp ai skill cursor

# User-wide Claude Code skill
myapp ai skill claude --global
```

On success, one line is printed to **stderr** with the install path (not the skill body).

## Opt-out

Skill install is **enabled by default**. Opt out on the program root:

```typescript
const cli: CliCommand = {
  key: "myapp",
  description: "My app.",
  aiSkill: { enabled: false },
  commands: [/* ... */],
};
```

Optional custom skill directory name:

```typescript
aiSkill: { name: "my-custom-skill" },
```

## Flags

Available on `ai skill cursor` and `ai skill claude`:

| Flag | Effect |
| --- | --- |
| `--global` | Install under the user skills directory instead of the project |
| `--force` | Overwrite an existing skill directory |

## Install locations

| Target | Project (default) | `--global` |
| --- | --- | --- |
| Cursor | `.cursor/skills/<name>/` | `~/.cursor/skills/<name>/` |
| Claude Code | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |

`<name>` defaults to the sanitized program root `key` (same rules as MCP tool name segments).

Do **not** install under `~/.cursor/skills-cursor/` — that path is reserved for Cursor built-ins.

## MCP vs skills

| Mechanism | Purpose |
| --- | --- |
| **`myapp ai mcp`** (requires `mcpServer`) | Runtime tool execution over MCP |
| **`myapp ai skill cursor\|claude`** | Static discovery and conventions for agents |

Generated `SKILL.md` recommends MCP when `mcpServer` is configured, and documents shell invocation as a fallback.

## Related

- [MCP server](mcp.md) — `mcpServer` config and `ai mcp` protocol
- [README built-ins](../README.md#built-ins) — reserved command `ai`
