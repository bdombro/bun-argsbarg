# Schemas (Zod)

Argsbarg schemas are authored in [**Zod 4**](https://zod.dev) (`zod` is a peer dependency). Zod validates at runtime, and argsbarg emits JSON Schema (draft 2020-12) for everything agents and tools read. Use this page when authoring `inputSchema`, `outputSchema`, `appConfig.schema`, or `errorSchema`.

## Where schemas go

| Field | Schema | Emitted as | Validated at runtime |
| --- | --- | --- | --- |
| `inputSchema` | any Zod schema | `io: "input"` | Yes: before the handler; the parsed value becomes `ctx.inputs` |
| `outputSchema` | any Zod schema | `io: "output"` | No: documentation, MCP/OpenAPI metadata, and handler return typing |
| `appConfig.schema` | Zod **object** schema | `io: "input"` | Yes: config file load, `configure set`, `ctx.appConfig.set` |
| `httpServer.errors.errorSchema` / `mcpServer.errors.errorSchema` | any Zod schema | `io: "output"` | No |

Emitted JSON Schema feeds MCP `tools/list`, OpenAPI (`/openapi.json`), non-TTY `--help` YAML, `docs cli` / `docs cli-schema`, config prompts, and `configure set` value coercion. Argsbarg 8 rejects plain JSON Schema objects in these fields at startup with a migration error.

## Authoring rules

- **Describe everything with `.describe("…")`.** Descriptions are the documentation agents read. Zod does not read JSDoc comments, so copy any JSDoc into `.describe()` on each field, nested object, union branch, and alias.
- **Prefer `z.strictObject`.** It emits `additionalProperties: false` and rejects unknown keys, so agents get feedback on typos. `z.object` silently strips unknown keys; MCP and HTTP servers log a `schema.strictness` warning at startup for input and config objects that accept unknown keys.
- **Pair each schema with a same-named type:** `export const X = z.strictObject({…}); export type X = z.infer<typeof X>;`.
- **Discriminated unions:** use `z.discriminatedUnion("kind", [...])` for union inputs. They emit `oneOf` and report a single precise error (`kind: Invalid discriminator value. Expected 'circle' | 'rect'`). Non-object roots are wrapped for MCP as `{ input }` / `{ result }` (see [mcp.md](mcp.md#object-rooted-schemas-and-wrapping)).
- **Defaults:** `.default(v)` makes a field optional in the emitted input schema, records `default`, and fills the value into `ctx.inputs`.
- **Recursion:** getters or `z.lazy` emit `$ref`. A recursive *union root* emits `$ref: "#"`, which breaks once MCP wraps the root; argsbarg rejects it at startup when MCP is enabled. Give the recursive part an object root instead.
- **Formats:** `z.iso.datetime()`, `z.iso.date()`, and `z.email()` emit `format` plus a regex `pattern`. The patterns are long, so keep an eye on MCP size budgets for big schemas.

## Unrepresentable constructs

Argsbarg emits every schema eagerly during startup validation, with `unrepresentable: "throw"`. Constructs JSON Schema cannot express fail immediately, naming the command or config:

- `z.date()`, `z.bigint()`, `z.map()`, `z.set()`, `z.symbol()`
- `.transform()` in an `outputSchema` or `errorSchema` (emitted with `io: "output"`). In an `inputSchema`, only the input side is emitted, so transforms there are fine.

Emit JSON-friendly types instead (for example `z.iso.datetime()` rather than `z.date()`). Refinements (`.refine()`) validate at runtime but do not appear in the emitted schema, so agents see a looser contract than the one enforced. Describe the rule in `.describe()`.

## Parsed inputs

With an `inputSchema`, `ctx.inputs` is Zod's **parsed output**:

- Defaults are applied and transforms have run.
- Strict schemas have rejected unknown keys.

Declare the command with `command` to get `ctx.inputs` typed as `z.output<typeof schema>` (see [cli-program.md](cli-program.md)).

On option-based commands, the validated object is the merged options, positionals, and MCP/HTTP tool arguments. Path parameters from `:param` command groups are validated only when the schema declares them. Otherwise they are left out of validation and merged back into `ctx.inputs`; typed handlers read them from `ctx.pathParams`.

## Errors

Validation errors are Zod messages prefixed with the value's path, capped at 10 plus a count. Missing fields read `required`, unknown keys list the allowed ones, and union/enum mismatches echo the rejected value:

```text
steps.0.kind: Invalid discriminator value. Expected 'alpha' | 'beta' (got "alfa")
name: required
$: Unrecognized key: "extra" (allowed: name, tags)
```

`schemaStrictnessWarnings(program)` lists input and config objects that accept unknown keys; assert it is empty in a test (the schema templates do, in `src/app.test.ts`).

## Partial config validation

`configure set` and bootstrap flows validate with `schema.partial()`. This makes every **top-level** key optional while still checking types and unknown keys; nested required fields stay required. Full loads validate the whole document.

## Argsbarg-specific behavior

- Framework keys (`_bindings`, …) are removed from config documents before validation.
- CLI `configure set` and interactive prompts coerce text (comma-separated primitive arrays, booleans, numbers, JSON literals) using the emitted JSON Schema, then validate the value against the key's Zod schema.
- Emitted schemas are memoized per schema object and frozen. Treat them as read-only.

## Where validation runs

| Surface | When |
| --- | --- |
| App config file | Load (strict), `configure set` / bootstrap (partial) |
| Command `inputSchema` | Before the handler (CLI, HTTP, MCP) |
| `outputSchema`, `errorSchema` | Emitted at startup only (not runtime-validated) |

## Related docs

- [cli-program.md](cli-program.md): `inputSchema`, JSON commands, `command`, `ctx.inputs`
- [config-schema.md](config-schema.md): `appConfig`
- [output-schema.md](output-schema.md): `outputSchema`

Implementation: [`src/core/zod-schema.ts`](../src/core/zod-schema.ts) (adapter), [`src/config/validate.ts`](../src/config/validate.ts), [`src/core/leaf-inputs.ts`](../src/core/leaf-inputs.ts).
