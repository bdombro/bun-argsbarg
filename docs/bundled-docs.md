# Bundled documentation (`docs`)

ArgsBarg can expose bundled markdown topics as the built-in `docs` command group. Opt in on the program root with `docs: { enabled: true, topics: { ... } }`.

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
myapp docs all          # all user topics; includes auto mcp when MCP enabled
myapp docs mcp          # auto-generated when mcpServer.enabled
```

## Configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | *(required)* | Must be `true` when `docs` is set |
| `description` | `"Print bundled CLI documentation."` | Router help for `myapp docs` |
| `defaultTopic` | first key in `topics` | `fallbackCommand` for bare `myapp docs` |
| `topics` | *(required)* | Topic key → `{ text, description? }` |

Reserved topic keys in `topics`: **`mcp`**, **`all`** (supplied by the built-in).

When `description` is omitted on a topic, ArgsBarg generates leaf help (`readme` → "Print README (user guide).").

## Compile-time bundling

Topic `text` must be **bundled markdown strings**. Use Bun text imports in the consumer module graph:

```typescript
import readmeText from "../README.md" with { type: "text" };
```

Bun embeds the file when you `bun build --compile`. ArgsBarg does not read the filesystem at runtime.

For several topics, use a barrel file (e.g. `src/docs/topics.ts`) so `index.tsx` stays small.

## MCP guide (`docs mcp`)

When both `docs.enabled` and `mcpServer.enabled` are `true`, ArgsBarg injects a **`docs mcp`** topic with an auto-generated guide: tool list, `requiresEnv`, schema resource URI, `install --mcp`, and protocol notes.

There is no override API in v1 — customize behavior via `mcpTool.description` on leaf commands.

## MCP tools

All `docs` subcommands are hidden from MCP `tools/list` (`mcpTool: { enabled: false }`).

## Skills vs docs vs MCP

| Channel | Role |
| --- | --- |
| `install --skill` | Shell command catalog + `--schema` JSON (no MCP setup) |
| `docs` | Bundled markdown on stdout |
| `mcp` | Callable tools + schema resource |

Do not declare a top-level command named **`docs`** when `docs.enabled` is `true` — it is reserved.
