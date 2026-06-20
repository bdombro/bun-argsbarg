# Agent skills

ArgsBarg can generate Cursor and Claude Code skill directories (`SKILL.md` + `reference.md`) from your CLI schema.

## Install via `install` (recommended)

Install skills to the user environment:

```bash
myapp install --skill --yes
# or
myapp install --all --yes
```

Skills are written when the agent home exists:

- Cursor: `~/.cursor/skills/<dir>/` when `~/.cursor` exists
- Claude Code: `~/.claude/skills/<dir>/` when `~/.claude` exists

The skill directory name defaults to the sanitized program `key` (e.g. `minimal.ts` → `minimal_ts`).

Existing skill directories are removed and rewritten on each install.

## Programmatic install

```typescript
import { cliSkillInstall } from "argsbarg/skill/install"; // internal module
```

For library use, call `cliSkillInstall(root, "cursor" | "claude", { global: true, rimraf: true })` — it returns changed file paths.

## Generated content

- **`SKILL.md`** — YAML frontmatter, when-to-use guidance, command catalog, MCP setup hints
- **`reference.md`** — full `--schema` JSON export

## MCP vs skills

| Mechanism | Role |
| --- | --- |
| **`myapp mcp`** (requires `mcpServer`) | Runtime tool execution over MCP |
| **`myapp install --skill`** | Static discovery files for agents |

See also:

- [MCP server](mcp.md) — `mcpServer` config and `mcp` protocol
- [Install](install.md) — binary, completions, skills, and MCP config
