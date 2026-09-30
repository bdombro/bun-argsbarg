# Schemas (Zod)

Argsbarg schemas are authored in [**Zod 4**](https://zod.dev) (`zod` is a peer dependency). Zod validates at runtime, and argsbarg emits JSON Schema (draft 2020-12) for everything agents and tools read: MCP `tools/list`, OpenAPI (`/openapi.json`), and piped `--help`. Plain JSON Schema objects in these fields fail at startup with a migration error.

## Where schemas go

| Field | Emitted as | Validated at runtime |
| --- | --- | --- |
| Command `inputSchema` | `io: "input"` | Yes, before the handler (CLI, HTTP, MCP); the parsed value becomes `ctx.inputs` |
| Command `pathParams` | `io: "input"` | Yes, before the handler |
| Command `outputSchema` | `io: "output"` | No: documentation, MCP/OpenAPI metadata, and handler return typing |
| `httpServer.errors.errorSchema` / `mcpServer.errors.errorSchema` | `io: "output"` | No |

Declare commands with `command({ … })` so `ctx.inputs`, `ctx.pathParams`, and the handler's return value are typed from these schemas (see [cli-program.md](cli-program.md)).

## Authoring rules

- **Describe everything with `.describe("…")`.** Descriptions are the documentation agents read. Zod doesn't read JSDoc, so copy any JSDoc into `.describe()` on each field, nested object, union branch, and alias.
- **Prefer `z.strictObject`.** It emits `additionalProperties: false` and rejects unknown keys, so agents get feedback on typos. `z.object` silently strips unknown keys; MCP and HTTP servers log a `schema.strictness` warning at startup for input objects that accept them. `schemaStrictnessWarnings(app.spec)` returns the same list — assert it's empty in a test (the schema templates do, in `src/app.test.ts`).
- **One schema per shape, with a same-named type:** `export const X = z.strictObject({…}); export type X = z.infer<typeof X>;`, in the command's `types.ts`. The same name works as a value and a type, so `import type { X }` keeps working.
- **Discriminated unions:** `z.discriminatedUnion("kind", [...])` emits `oneOf` and reports one precise error (`kind: Invalid discriminator value. Expected 'circle' | 'rect'`). MCP wraps non-object roots as `{ input }` / `{ result }` (see [mcp.md](mcp.md#object-rooted-schemas-and-wrapping)).
- **Defaults:** `.default(v)` makes a field optional in the emitted input schema, records `default`, and fills the value into `ctx.inputs`.
- **Recursion:** getters or `z.lazy` emit `$ref`. A recursive *union root* emits `$ref: "#"`, which breaks once MCP wraps the root; argsbarg rejects it at startup when MCP is enabled. Give the recursive part an object root instead.
- **Formats:** `z.iso.datetime()`, `z.iso.date()`, and `z.email()` emit `format` plus a regex `pattern`. The patterns are long, so watch MCP size budgets for big schemas.

## Unrepresentable constructs

Argsbarg emits every schema eagerly at startup with `unrepresentable: "throw"`, so constructs JSON Schema can't express fail immediately, naming the command:

- `z.date()`, `z.bigint()`, `z.map()`, `z.set()`, `z.symbol()`
- `.transform()` in an `outputSchema` or `errorSchema` (emitted with `io: "output"`). In an `inputSchema` only the input side is emitted, so transforms there are fine.

Use JSON-friendly types instead (`z.iso.datetime()` rather than `z.date()`). Refinements (`.refine()`) validate at runtime but don't appear in the emitted schema, so agents see a looser contract than the one enforced — describe the rule in `.describe()`.

## Input schemas

With an `inputSchema`, `ctx.inputs` is Zod's **parsed output**: defaults applied, transforms run, and (with strict schemas) unknown keys rejected.

On option-based commands the validated object is the merged options, positionals, and MCP/HTTP tool arguments. Path parameters from `:param` command groups are validated only when the command declares `pathParams`; otherwise they're left out of validation and merged back into `ctx.inputs`.

Validation errors are Zod messages prefixed with the value's path, capped at 10 plus a count. Missing fields read `required`, unknown keys list the allowed ones, and union/enum mismatches echo the rejected value:

```text
steps.0.kind: Invalid discriminator value. Expected 'alpha' | 'beta' (got "alfa")
name: required
$: Unrecognized key: "extra" (allowed: name, tags)
```

## Output schemas

Set `outputSchema` on a command when its handler emits JSON (with `--json`, always for JSON-only commands, or on the MCP headless path):

```typescript
// src/commands/status/types.ts
import { z } from "zod";

/** JSON stdout for `myapp status --json`. */
export const StatusJsonOutput = z.strictObject({
  version: z.string().describe("App version from the app spec."),
});
export type StatusJsonOutput = z.infer<typeof StatusJsonOutput>;

// src/commands/status/command.ts
export const statusCommand = command({
  key: "status",
  description: "Show environment status.",
  outputSchema: StatusJsonOutput,
  handler: (ctx) => ({ version: ctx.spec.version }), // typed against StatusJsonOutput
});
```

- **Not validated at runtime.** The schema documents stdout for MCP `tools/list` (as `outputSchema`, with parsed JSON returned as `structuredContent`), OpenAPI responses, and piped `--help`, and it types handler returns.
- **Set it on the command,** not under `mcpTool`.
- **Handlers that only print** still type-check: the return type is the schema's output type or `void`.
- **Narrowing:** when a shared runtime type is wider than one command's JSON, give the command its own schema (`.pick()`, `.omit()`, or a fresh `z.strictObject`) and add an assignability test so runtime rows keep satisfying it.
- **Out of scope:** plain-text, streaming, and Ink-only commands.

Reference implementation: [`examples/api/`](../examples/api/) — `status` (`StatusJsonOutput`) and `shape-area` (a discriminated-union input).

## Notes

- Emitted schemas are memoized per schema object and frozen; treat them as read-only.
- The Zod adapter is one module (`src/core/zod-schema.ts` in the repo), so the rest of argsbarg works on JSON Schema.
