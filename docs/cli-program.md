# Writing `CliProgram` and leaf commands

ArgsBarg turns your schema into help, shell completions, MCP tools, and agent skills. **The same `description` fields you write for humans are the agent contract** for basic apps.

## Minimal app (MCP is free)

```typescript
const cli = {
  key: "myapp",
  version: "1.0.0",
  description: "One-line summary of what the CLI does.",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "greet",
      description: "Greet someone by name.",
      positionals: [
        { name: "name", description: "Who to greet.", kind: CliOptionKind.String },
      ],
      handler: async (ctx) => { /* ... */ },
    },
  ],
} satisfies CliProgram;
```

No `mcpTool` blocks required. Every leaf becomes an MCP tool; `inputSchema` comes from options and positionals.

## Descriptions

Write for **what the command does**, not how the UI works:

- **Good:** `Reserve a QA environment.`
- **Weak:** `Opens the reservation wizard.`

Option and positional `description` strings appear in `-h`, MCP `inputSchema`, and generated skills — keep them concrete (`Environment name (e.g. qa2).`).

Use root **`notes`** for cross-cutting hints shown in help (install commands, docs topics, VPN requirements).

## Well-known options (auto MCP hints)

When these option **names** appear on a leaf, ArgsBarg appends agent hints to the MCP tool description:

| Option name | Hint |
| --- | --- |
| `yes` | non-interactive / confirm mutations |
| `dry-run` | preview without side effects |
| `json` | structured stdout |

Prefer these names when the semantics match. Mutating commands that need scriptable use should expose **`--yes`** or **`--dry-run`** rather than custom flag names.

## When to use `mcpTool` (escape hatches only)

| Field | Use when |
| --- | --- |
| `enabled: false` | Command is CLI-only (Ink UI, browser open, internal debug) |
| `requiresEnv: [...]` | Runtime secrets; appended to MCP description and enforced at `tools/call` |
| `description: "..."` | MCP contract **differs** from help text (e.g. "`--watch` is CLI-only") |

If help text and MCP behavior match, **omit `mcpTool`** — overrides replace auto hints entirely.

## Interactive / Ink CLIs

- Branch on `ctx.invocation === "mcp"` or use ArgsBarg headless helpers (`shouldRunHeadless`, `shouldRunHeadlessWithYes`).
- MCP invocation is always headless; do not mount TUI on the MCP wire.
- Hide commands that cannot work headless with `mcpTool: { enabled: false }`.

## Reserved names

Do not declare user commands named `completion`, `install`, `mcp`, `version`, `docs`, or `update` at the root — ArgsBarg injects these when configured.

## Cursor rule for consumer repos

Copy `node_modules/argsbarg/docs/templates/cursor/rules/cli-program.mdc` to `.cursor/rules/cli-program.mdc` so agents editing your CLI schema follow these conventions.

## See also

- [MCP server](mcp.md) — tools, schema resource, env bootstrapping
- [Agent skills](ai-skills.md) — `install --skill`
- [Bundled docs](bundled-docs.md) — `docs` topics and `docs mcp`
