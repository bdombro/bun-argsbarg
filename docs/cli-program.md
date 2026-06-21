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

## Inline schema by default

ArgsBarg is **schema-first** — the program tree is the product. **Keep `CliProgram` and leaf fields inline** (`key`, `description`, `options`, `positionals`, `handler`) so a reader sees the full command contract in one place.

**Inline by default:**

```typescript
{
  key: "reserve",
  description: "Reserve a QA environment.",
  options: [
    { name: "yes", description: "Skip confirmation; use for non-interactive runs.", kind: CliOptionKind.Presence },
    { name: "dry-run", description: "Preview without mutating.", kind: CliOptionKind.Presence },
  ],
  positionals: [
    { name: "env", description: "Environment name.", kind: CliOptionKind.String, argMin: 0, argMax: 1 },
  ],
  handler: async (ctx) => { /* … */ },
}
```

**Extract only when well justified:**

| Extract | When |
| --- | --- |
| Shared option objects (`DRY_RUN_OPTION`, `JSON_OPTION`) | Identical flag reused on many leaves |
| Shared spreads (`...MCP_TOOL_MUTATOR`) | Same `mcpTool` metadata on a family of commands |
| `somethingCommand()` factory | Entry file is large; handler/body is substantial (Ink page, headless dispatch) |
| `docs.topics` text imports | Compile-time markdown bundling — not schema shape |

**Avoid extracting** thin indirection: a file that only re-exports `{ key, description, options }` with no logic, or splitting every leaf into its own module when the handler is a few lines. If extraction does not reduce duplication or file size materially, keep it inline.

**`satisfies CliProgram`** on the root (or on extracted command factories) preserves type-checking whether inline or not.

## Descriptions

Write for **what the command does**, not how the UI works:

- **Good:** `Reserve a QA environment.`
- **Weak:** `Opens the reservation wizard.`

Option and positional `description` strings appear in `-h`, MCP `inputSchema`, and generated skills — keep them concrete (`Environment name (e.g. qa2).`).

Use root **`notes`** for cross-cutting hints shown in help (install commands, docs topics, VPN requirements).

## Well-known option names

Prefer **`yes`**, **`dry-run`**, and **`json`** when semantics match. They appear in `-h`, MCP `inputSchema`, and generated skills — write clear option `description` strings (e.g. "Skip confirmation; use for non-interactive runs.").

## When to use `mcpTool` (escape hatches only)

**Omit `mcpTool` unless you have a specific reason.**

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

## Headless-capable handlers

Simple leaves (read args, print stdout) are already headless — no extra work. **Any handler that might mount Ink, prompt, or open a browser should also implement a scriptable fast path** for:

- **MCP** (`ctx.invocation === "mcp"` — always non-interactive)
- **Non-TTY CLI** (pipes, CI, `myapp cmd --yes` in a script)
- **Explicit flags** (`--json`, `--dry-run`)

Use **one headless implementation** for all three; do not fork separate "MCP handlers."

### When to branch

| Command kind | Headless trigger | Helpers |
| --- | --- | --- |
| Read / query | MCP, `--json`, or non-TTY | `shouldRunHeadless`, `wantsExplicitJson` |
| Mutate | MCP with args + `yes`/`dry-run`, or non-TTY with `--yes` | `shouldRunHeadlessWithYes`, `requireYesInNonTty` |
| Mutate with positionals | Same, but avoid auto-headless on empty argv | `shouldRunHeadlessWithPositionals` |

### Recommended handler shape

**Mutating command** (wizard optional, script path required):

```typescript
import {
  requireYesInNonTty,
  shouldRunHeadlessWithYes,
} from "argsbarg";

handler: async (ctx) => {
  const dryRun = ctx.hasFlag("dry-run");
  const yes = ctx.hasFlag("yes");
  const env = ctx.args[0];

  requireYesInNonTty(yes, "Example: myapp reserve qa2 --yes", dryRun);

  if (shouldRunHeadlessWithYes(ctx, { yes, hasRequiredArgs: !!env, dryRun })) {
    const result = await executeReserve({ dryRun, env, yes });
    process.stdout.write(`${result.message}\n`);
    return;
  }

  await renderInteractiveWizard({ env, yes, dryRun });
};
```

**Read / query command** (optional `--json`):

```typescript
import { shouldRunHeadless, wantsExplicitJson } from "argsbarg";

handler: async (ctx) => {
  const json = ctx.hasFlag("json");

  if (shouldRunHeadless(ctx, json)) {
    const data = await fetchStatus(ctx.args[0]);
    if (wantsExplicitJson(ctx, json)) {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    } else {
      process.stdout.write(formatStatusHuman(data));
    }
    return;
  }

  await renderPage(<StatusPage env={ctx.args[0]} />);
};
```

### Rules of thumb

1. **Resolvable from flags** — if a human can complete the action with flags, an agent can too (`--env qa2 --yes`). Wizards are optional sugar on TTY.
2. **`--yes` on mutators** — required for non-TTY CLI scripts; MCP should pass `yes: true` in tool arguments when the schema exposes `yes`.
3. **Stdout is the contract** — headless paths write results to stdout (or JSON with `--json`); stderr for errors. No Ink on the MCP wire.
4. **`ctx.invocation === "mcp"`** — use only for wire-specific behavior (pipe child stdout, reject `--watch`, etc.), not to duplicate business logic.
5. **Hide only when impossible** — `mcpTool.enabled: false` after confirming no headless path exists (browser-only, irreducible streaming).

Basic synchronous handlers do not need this structure — only commands with an interactive branch.

## Reserved names

Do not declare user commands named `completion`, `install`, `mcp`, `version`, `docs`, or `update` at the root — ArgsBarg injects these when configured.

## Cursor rule for consumer repos

Copy `node_modules/argsbarg/docs/templates/cursor/rules/cli-program.mdc` to `.cursor/rules/cli-program.mdc` so agents editing your CLI schema follow these conventions.

## See also

- [MCP server](mcp.md) — tools, schema resource, env bootstrapping
- [Agent skills](ai-skills.md) — `install --skill`
- [Bundled docs](bundled-docs.md) — `docs` topics and `docs mcp`
