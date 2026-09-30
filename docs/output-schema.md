# Output schemas (`outputSchema`)

How to describe JSON stdout on commands with a handler with a Zod schema.

## Argsbarg contract

On **commands with a handler**, set `outputSchema` to a Zod schema when the handler emits JSON (typically with `--json`, always for JSON-only commands, or on the MCP headless path). Declare the command with `command` so the handler's return value is typed from the schema.

```typescript
// src/commands/status/types.ts
import { z } from "zod";

/** JSON stdout for `myapp status --json`. */
export const StatusJsonOutput = z.strictObject({
  version: z.string().describe("App version from the app spec."),
});

/** `status --json` payload. */
export type StatusJsonOutput = z.infer<typeof StatusJsonOutput>;
```

```typescript
// src/commands/status/command.ts
import { command } from "argsbarg";
import { StatusJsonOutput } from "./types.ts";

export const statusCommand = command({
  key: "status",
  description: "Show environment status.",
  outputSchema: StatusJsonOutput,
  handler: (ctx) => ({ version: ctx.spec.version }), // typed against StatusJsonOutput
});
```

| Where argsbarg uses it | Purpose |
| --- | --- |
| `myapp docs cli-schema` | Full command tree JSON export |
| `myapp docs cli` | Markdown per-command **Output** section |
| MCP `tools/list` | Optional `outputSchema` on each tool |
| HTTP `GET /openapi.json` | Response schema per tool |
| CLI `--help` (non-TTY) | YAML output schema for zero-drift in-band agent discovery |

argsbarg emits the schema as JSON Schema (draft 2020-12) with `z.toJSONSchema(schema, { io: "output" })`.

- **Not validated at runtime.** argsbarg does not parse or reject handler stdout against the schema. The schema is documentation and MCP/HTTP metadata, and with `command` it also type-checks handler returns.
- **Set it on the command only,** not under `mcpTool`.
- **Handlers that only print** (returning nothing) still type-check: the return type is the schema's output type or `void`.

See [cli-program.md — Structured stdout](cli-program.md#structured-stdout) for when to use `outputSchema` vs `notes`, [mcp.md](mcp.md) for how MCP returns parsed JSON as `structuredContent`, and [json-schema-subset.md](json-schema-subset.md) for authoring rules shared by all schemas.

## Schema-facing types

**Goal:** emitted schemas match what handlers actually print, with descriptions agents can read in `docs cli`, `--help`, and MCP.

1. **One schema per shape, with a same-named type.** Export `export const X = z.…` and `export type X = z.infer<typeof X>`. The same name works as both a value and a type, so `import type { X }` keeps working.
2. **Describe every field with `.describe("…")`.** Zod does not read JSDoc, so a `/** … */` comment is invisible to agents. Put the text in `.describe()` on each field, and on nested and aliased schemas too.
3. **Unions:** `z.discriminatedUnion("kind", [...])` emits `oneOf` with one precise error per bad discriminator. As an MCP `inputSchema`/`outputSchema`, a non-object root is wrapped as `{ input }` / `{ result }` (see [mcp.md — Object-rooted schemas and wrapping](mcp.md#object-rooted-schemas-and-wrapping)).
4. **Formats:** `z.iso.datetime()` / `z.iso.date()` emit `format: "date-time"` / `"date"`.
5. **Representable constructs only.** `z.date()`, transforms, and other constructs JSON Schema cannot express fail at startup, naming the command. Emit strings (`z.iso.datetime()`) instead.

### Narrowing when runtime ≠ stdout

When a shared runtime type is **wider** than one command's JSON, define a **schema-facing** schema in the command's `types.ts` (`.pick()`, `.omit()`, or a fresh `z.strictObject`). Add an assignability test so runtime rows keep satisfying the schema-facing type.

## Tests

Per consumer repo (optional): smoke-test key `outputSchema` values, e.g. `z.toJSONSchema(StatusJsonOutput)` has the expected properties and descriptions.

## Contributor workflow

1. Add or edit Zod schemas in `src/**/types.ts`, with `.describe()` on every field.
2. Wire them on commands with `command({ outputSchema, … })`.
3. Run `just docgen` / `myapp docs cli --save` to refresh consumer docs.

Add a bullet under your app's `## App conventions` section in `AGENTS.md` pointing at `node_modules/argsbarg/docs/output-schema.md`.

**Reference implementation:** [`examples/api/`](../examples/api/): the `status` command with `StatusJsonOutput`, and `shape-area` with a discriminated-union input.

## Out of scope

- Runtime validation of handler stdout
- `outputSchema` for plain-text, streaming, or Ink-only commands

## See also

- [json-schema-subset.md](json-schema-subset.md): authoring schemas with Zod
- [config-schema.md](config-schema.md): `appConfig.schema`
- [cli-program.md](cli-program.md): structured stdout, headless JSON, `read*Flags`
- [mcp.md](mcp.md): `tools/list`, `structuredContent`
- [bundled-docs.md](bundled-docs.md): `docs cli` / `docs cli-schema` docgen
- [docs/README.md](README.md): documentation map
