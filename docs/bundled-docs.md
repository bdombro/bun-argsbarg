# Bundled documentation (`docs`)

ArgsBarg exposes the built-in `docs` command group on every CLI by default. Built-in subcommands (`cli-schema`, `cli`, `skill`, and conditional `mcp` / `http` / `openapi`) work with zero config. Add optional `docs.topics` for consumer-authored markdown, or opt out with `docs: { enabled: false }`.

## Framework docs vs your app's docgen

Two documentation layers often coexist in a consumer repo:

| Layer | Contents | How agents/humans get it |
| --- | --- | --- |
| **Argsbarg framework** | How to author `CliProgram`, MCP varargs policy, headless patterns | `node_modules/argsbarg/docs/` — wired via consumer [`AGENTS.md`](../examples/full-example-json/AGENTS.md) |
| **Your CLI (docgen)** | Your command tree, options, MCP tool list, install notes | `myapp docs cli`, `docs cli-schema`, `docs mcp` — save with `--save` to `./docs/` |

`docs cli` and `docs cli-schema` embed each leaf’s `outputSchema` when set — see [output-schema.md](output-schema.md) for how to generate and wire schemas.

Do not confuse them: editing `./docs/cli.md` after docgen updates **your** app reference; it does not change argsbarg's framework guides. When MCP behavior changes (e.g. varargs arrays in 3.6+), update consumer `docs/mcp.md` via **`myapp docs mcp --save`** and bump the `argsbarg` dependency.

See [docs/README.md](README.md) for the full documentation map.

## Quick start

Zero config — built-in docgen only:

```typescript
const cli = {
  key: "myapp",
  version: "1.0.0",
  description: "My app.",
  commands: [/* ... */],
} satisfies CliProgram;
```

Optional consumer markdown topics:

```typescript
import readmeText from "../README.md" with { type: "text" };
import archText from "../docs/architecture.md" with { type: "text" };

const cli = {
  key: "myapp",
  version: "1.0.0",
  description: "My app.",
  docs: {
    topics: {
      readme: { text: readmeText },
      architecture: { text: archText, description: "Contributor architecture notes." },
    },
  },
  commands: [/* ... */],
} satisfies CliProgram;
```

```bash
myapp docs              # router help (subcommand list)
myapp docs readme
myapp docs architecture
myapp docs cli-schema       # full command tree as JSON
myapp docs cli          # command tree as markdown
myapp docs skill        # generated Cursor SKILL.md
myapp docs mcp          # auto-generated when mcpServer.enabled
myapp docs http         # auto-generated when httpServer.enabled
myapp docs openapi      # OpenAPI 3.1 JSON when httpServer.enabled
myapp docs readme --save   # write ./docs/readme.md
myapp docs cli-schema --save   # write ./docs/cli-schema.json
myapp docs openapi --save  # write ./docs/openapi.json
```

Top-level `myapp --help` points agents at `myapp docs skill`. The `docs skill` subcommand description recommends `configure` for a persisted bundle.

## Configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to disable the `docs` built-in |
| `description` | `"Print bundled CLI documentation."` | Router help for `myapp docs` |
| `topics` | *(none)* | Optional topic key → `{ text, description? }` |

Reserved topic keys in `topics`: **`http`**, **`mcp`**, **`all`**, **`schema`**, **`cli`**, **`skill`**, **`openapi`** (reserved — use the matching `docs <name>` subcommand instead).

When `description` is omitted on a topic, ArgsBarg generates leaf help (`readme` → "Print README (user guide).").

## Compile-time bundling

Topic `text` must be **bundled markdown strings**. Use Bun text imports in the consumer module graph:

```typescript
import readmeText from "../README.md" with { type: "text" };
```

Bun embeds the file when you `bun build --compile`. ArgsBarg does not read the filesystem at runtime.

Inline topics in your program root when the set is small; use a separate module only if the import map grows enough to clutter `index.tsx`.

## CLI schema, API, and skill (`docs cli-schema`, `docs cli`, `docs skill`)

By default (unless `docs.enabled: false`):

- **`docs cli-schema`** — same JSON as the former root `--schema` flag (handlers omitted; built-in subtrees included for leaf roots).
- **`docs cli`** — markdown rendering of the same command tree (options, positionals, subcommands, fallback routing).
- **`docs skill`** — prints the compact `SKILL.md` index. Prefer `configure --refresh --yes` for agents (persists index + full API in `reference.md`).

## MCP guide (`docs mcp`)

When both docs (default) and `mcpServer.enabled` are `true`, ArgsBarg injects a **`docs mcp`** topic with an auto-generated guide: tool list, `program.appConfig`, schema resource URI, `configure --refresh`, and protocol notes.

There is no override API in v1 — customize behavior via `mcpTool.description` on leaf commands.

## HTTP guide (`docs http`)

When both docs (default) and `httpServer.enabled` are `true`, ArgsBarg injects a **`docs http`** topic with curl examples, endpoints, and tool list.

Shell invocation tables remain under **`docs cli`** (not HTTP).

## OpenAPI (`docs openapi`)

When both docs (default) and `httpServer.enabled` are `true`, ArgsBarg injects a **`docs openapi`** topic with the same OpenAPI 3.1 document served at `GET /openapi.json`.

## MCP tools

All `docs` subcommands are hidden from MCP `tools/list` (`mcpTool: { enabled: false }`).

## Skills vs docs vs MCP

| Channel | Role |
| --- | --- |
| `configure` (skill targets) | Writes compact `SKILL.md` + full-API `reference.md` to disk |
| `docs skill` | Print generated `SKILL.md` to stdout |
| `docs cli` | Print command tree markdown to stdout |
| `docs cli-schema` | Print command tree JSON to stdout |
| `docs` | Bundled markdown topics on stdout |
| MCP docs topic resources | User `docs.topics` on the MCP wire (`<mcpId>://docs/<topic>`) when docs + MCP enabled |
| `mcp` | Callable tools + schema resource |

Do not declare a top-level command named **`docs`** unless `docs.enabled: false` — it is reserved by default.

## Agent artifact contract

Load one primary artifact per task — avoid pulling `reference.md`, `cli-schema.json`, and `openapi.json` together unless you need all three.

| Goal | Load |
| --- | --- |
| Route to the right command | `SKILL.md` (via `configure` or `docs skill`) |
| Full command tree + option prose | `reference.md` or `docs cli` |
| Machine-readable CLI tree + schemas | `docs cli-schema` |
| HTTP request/response shapes | `docs openapi` or `GET /openapi.json` |
| MCP tool list + env config | `docs mcp` |

Skill `reference.md` is **compact** (no embedded `outputSchema` JSON blocks). Fetch `cli-schema` or OpenAPI when you need exact shapes.

## Save to disk (`--save`)

Pass **`--save`** on `docs` or any docs subcommand to write files under **`./docs/`** (relative to the current working directory). Each saved path is printed on stdout.

| Command | Output |
| --- | --- |
| `docs readme --save` | `./docs/readme.md` |
| `docs cli-schema --save` | `./docs/cli-schema.json` |
| `docs openapi --save` | `./docs/openapi.json` |
| `docs cli --save` | `./docs/cli.md` |
| `docs skill --save` | `./docs/skill.md` |

Argsbarg-generated markdown (`mcp`, `http`, `skill`) includes a `Generated by … docs … --save` HTML comment (`skill` places it after YAML frontmatter so parsers still work). `cli-schema.json`, `openapi.json`, and argsbarg-generated markdown resolve `{argsbarg:program}` in `notes` to the program key. Consumer-authored topic files are written as-is.
