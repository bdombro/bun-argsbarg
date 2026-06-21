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

**Omit `mcpTool` unless you have a specific reason.** Overrides replace the entire auto-generated MCP description (including `yes` / `dry-run` / `json` hints).

### Fix the CLI first

Many "MCP problems" are schema or handler gaps. Prefer these over escape hatches:

| Problem | Fix (not `mcpTool`) |
| --- | --- |
| Agents don't know which flags to pass | Use standard option names (`yes`, `dry-run`, `json`); improve option `description` strings |
| MCP calls hang on prompts | Add `--yes` and a headless code path; use `shouldRunHeadlessWithYes` |
| Help text describes Ink UI | Rewrite leaf `description` as the action ("Reserve an environment.") |
| MCP needs different args than humans | Expose the same flags; resolve defaults in the handler for both `cli` and `mcp` |
| Command "doesn't work" over MCP | Branch on `ctx.invocation === "mcp"` in the handler (stdio is the wire) |

### When escape hatches are appropriate

| Field | Use when |
| --- | --- |
| `enabled: false` | Command is **genuinely** CLI-only (open browser, Ink-only flow with no scriptable equivalent) |
| `requiresEnv: [...]` | Runtime secrets; appended to MCP description and enforced at `tools/call` |
| `description: "..."` | **Irreducible** MCP limitation (e.g. live tail / `--watch` cannot be streamed on the MCP wire yet) |

Do **not** use `mcpTool.description` to paper over missing `--yes`, non-standard flag names, or handlers that only work interactively — fix those instead.

If help text and MCP behavior match after your fixes, **omit `mcpTool` entirely**.

## Interactive / Ink CLIs

- Branch on `ctx.invocation === "mcp"` or use ArgsBarg headless helpers (`shouldRunHeadless`, `shouldRunHeadlessWithYes`).
- MCP invocation is always headless; do not mount TUI on the MCP wire.
- Hide commands that **cannot** work headless even with `--yes` / resolved flags — use `mcpTool: { enabled: false }` only after confirming a headless path is infeasible.

## Reserved names

Do not declare user commands named `completion`, `install`, `mcp`, `version`, `docs`, or `update` at the root — ArgsBarg injects these when configured.

## Cursor rule for consumer repos

Copy `node_modules/argsbarg/docs/templates/cursor/rules/cli-program.mdc` to `.cursor/rules/cli-program.mdc` so agents editing your CLI schema follow these conventions.

## See also

- [MCP server](mcp.md) — tools, schema resource, env bootstrapping
- [Agent skills](ai-skills.md) — `install --skill`
- [Bundled docs](bundled-docs.md) — `docs` topics and `docs mcp`
