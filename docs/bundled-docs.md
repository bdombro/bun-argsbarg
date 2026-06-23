# Bundled documentation (`docs`)

ArgsBarg can expose bundled markdown topics as the built-in `docs` command group. Opt in on the program root with `docs: { enabled: true, topics: { ... } }`.

## Framework docs vs your app's docgen

Two documentation layers often coexist in a consumer repo:

| Layer | Contents | How agents/humans get it |
| --- | --- | --- |
| **Argsbarg framework** | How to author `CliProgram`, MCP varargs policy, headless patterns | `node_modules/argsbarg/docs/` — wire via [Cursor rule](templates/cursor/rules/cli-program.mdc) or `AGENTS.md` |
| **Your CLI (docgen)** | Your command tree, options, MCP tool list, install notes | `myapp docs api`, `docs schema`, `docs mcp` — save with `--save` to `./docs/` |

Do not confuse them: editing `./docs/api.md` after docgen updates **your** app reference; it does not change argsbarg's framework guides. When MCP behavior changes (e.g. varargs arrays in 3.6+), update consumer `docs/mcp.md` via **`myapp docs mcp --save`** and bump the `argsbarg` dependency.

See [docs/README.md](README.md) for the full documentation map.

## Quick start

```typescript
import readmeText from "../README.md" with { type: "text" };
import archText from "../docs/architecture.md" with { type: "text" };

const cli = {
  key: "myapp",
  version: "1.0.0",
  description: "My app.",
  docs: {
    enabled: true,
    topics: {
      readme: { text: readmeText },
      architecture: { text: archText, description: "Contributor architecture notes." },
    },
  },
  commands: [/* ... */],
} satisfies CliProgram;
```

```bash
myapp docs              # first topic (readme) via fallback
myapp docs readme
myapp docs architecture
myapp docs schema       # full command tree as JSON
myapp docs api          # command tree as markdown
myapp docs skill        # generated Cursor SKILL.md
myapp docs mcp          # auto-generated when mcpServer.enabled
myapp docs readme --save   # write ./docs/readme.md
myapp docs schema --save   # write ./docs/schema.json
```

When `docs` is enabled, top-level `myapp --help` points agents at `myapp docs skill`. The `docs skill` subcommand description recommends `install --skill` for a persisted bundle.

## Configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | *(required)* | Must be `true` when `docs` is set |
| `description` | `"Print bundled CLI documentation."` | Router help for `myapp docs` |
| `defaultTopic` | first key in `topics` | `fallbackCommand` for bare `myapp docs` |
| `topics` | *(required)* | Topic key → `{ text, description? }` |

Reserved topic keys in `topics`: **`mcp`**, **`all`**, **`schema`**, **`api`**, **`skill`** (reserved — use the matching `docs <name>` subcommand instead).

When `description` is omitted on a topic, ArgsBarg generates leaf help (`readme` → "Print README (user guide).").

## Compile-time bundling

Topic `text` must be **bundled markdown strings**. Use Bun text imports in the consumer module graph:

```typescript
import readmeText from "../README.md" with { type: "text" };
```

Bun embeds the file when you `bun build --compile`. ArgsBarg does not read the filesystem at runtime.

Inline topics in your program root when the set is small; use a separate module only if the import map grows enough to clutter `index.tsx`.

## Schema, API, and skill (`docs schema`, `docs api`, `docs skill`)

When `docs.enabled` is `true`:

- **`docs schema`** — same JSON as the former root `--schema` flag (handlers omitted; built-in subtrees included for leaf roots).
- **`docs api`** — markdown rendering of the same command tree (options, positionals, subcommands, fallback routing).
- **`docs skill`** — prints the compact `SKILL.md` index. Prefer `install --skill --yes` for agents (persists index + full API in `reference.md`).

## MCP guide (`docs mcp`)

When both `docs.enabled` and `mcpServer.enabled` are `true`, ArgsBarg injects a **`docs mcp`** topic with an auto-generated guide: tool list, `requiresEnv`, schema resource URI, `install --mcp`, and protocol notes.

There is no override API in v1 — customize behavior via `mcpTool.description` on leaf commands.

## MCP tools

All `docs` subcommands are hidden from MCP `tools/list` (`mcpTool: { enabled: false }`).

## Skills vs docs vs MCP

| Channel | Role |
| --- | --- |
| `install --skill` | Writes compact `SKILL.md` + full-API `reference.md` to disk |
| `docs skill` | Print generated `SKILL.md` to stdout |
| `docs api` | Print command tree markdown to stdout |
| `docs schema` | Print command tree JSON to stdout |
| `docs` | Bundled markdown topics on stdout |
| `mcp` | Callable tools + schema resource |

Do not declare a top-level command named **`docs`** when `docs.enabled` is `true` — it is reserved.

## Save to disk (`--save`)

Pass **`--save`** on `docs` or any docs subcommand to write files under **`./docs/`** (relative to the current working directory). Each saved path is printed on stdout.

| Command | Output |
| --- | --- |
| `docs readme --save` | `./docs/readme.md` |
| `docs schema --save` | `./docs/schema.json` |
| `docs api --save` | `./docs/api.md` |
| `docs skill --save` | `./docs/skill.md` |

Argsbarg-generated markdown (`mcp`, `api`, `skill`) includes a `Generated by … docs … --save` HTML comment (`skill` places it after YAML frontmatter so parsers still work). `schema.json` and argsbarg-generated markdown resolve `{argsbarg:program}` in `notes` to the program key. Consumer-authored topic files are written as-is.
