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

- **`SKILL.md`** — YAML frontmatter, when-to-use guidance, shell command catalog, pitfalls
- **`reference.md`** — full `docs schema` JSON export

Skills describe **shell invocation only** — no MCP setup, `mcp.json`, or `tools/call` guidance. Use **`myapp docs mcp`** (when `docs` and `mcpServer` are enabled) or connect the MCP server for agent execution.

## MCP vs skills vs docs

| Mechanism | Role |
| --- | --- |
| **`myapp mcp`** (requires `mcpServer`) | Runtime tool execution over MCP |
| **`myapp install --skill`** | Static shell command catalog for agents |
| **`myapp docs`** (requires `docs`) | Bundled markdown on stdout (`docs mcp` when MCP enabled) |

Command catalog lines reuse MCP tool descriptions. See [cli-program.md](cli-program.md).

See also:

- [Bundled docs](bundled-docs.md) — `docs` config and compile-time imports
- [MCP server](mcp.md) — `mcpServer` config and `mcp` protocol
- [Install](install.md) — binary, completions, skills, and MCP config
