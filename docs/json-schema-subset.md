# JSON Schema validation

Argsbarg validates `program.appConfig`, leaf `inputSchema`, and related documents with [**@cfworker/json-schema**](https://www.npmjs.com/package/@cfworker/json-schema). The validator draft is chosen from each schema’s `$schema` URI (default **Draft-07** when omitted). Use this page when authoring schemas for config files, `inputSchema` on leaves, or `@sg` schemagen output.

## Schema draft

| `$schema` (examples) | Validator draft |
| --- | --- |
| *(omitted)* | Draft-07 (schemagen default) |
| `http://json-schema.org/draft-07/schema#` | Draft-07 |
| `https://json-schema.org/draft/2019-09/schema` | 2019-09 |
| `https://json-schema.org/draft/2020-12/schema` | 2020-12 |

Hand-written schemas may use **2020-12** with `$defs` and `#/$defs/...` `$ref`s. Schemagen (`ts-json-schema-generator`) still emits Draft-07 with `definitions`.

## From Zod (or other generators)

You can pass JSON Schema from **`zod-to-json-schema`**, Zod v4 **`z.toJSONSchema()`**, or any tool that emits a root schema with `$schema`:

| Source | Typical `$schema` | Works with argsbarg |
| --- | --- | --- |
| `zod-to-json-schema` (default) | Draft-07 | Yes — matches default when `$schema` omitted |
| `z.toJSONSchema()` (default) | 2020-12 | Yes — draft resolved from `$schema` |
| argsbarg schemagen | Draft-07 | Yes |

Set the result on `leaf.inputSchema` or `program.appConfig.jsonSchema`. Validation uses the schema object and its `$schema` URI; not every Zod feature survives JSON Schema conversion (refinements, transforms, etc.).

## Supported constructs

Validation uses [@cfworker/json-schema](https://www.npmjs.com/package/@cfworker/json-schema) for the draft declared by `$schema`. Schemas from schemagen and typical Zod exports commonly use:

| Feature | Notes |
| --- | --- |
| `type` | `object`, `array`, `string`, `integer`, `number`, `boolean`, `null` |
| `properties` / `required` | Object keys; `additionalProperties: false` enforced when set |
| `items` | Homogeneous arrays; comma-separated CLI strings coerced when `items` is a primitive |
| `enum` / `const` | Exact value checks |
| `anyOf` / `oneOf` / `allOf` | Combinators (validator-native) |
| `$ref` | **Local only** — `#/definitions/Name` (Draft-07) or `#/$defs/Name` (2019-09 / 2020-12) |
| `definitions` / `$defs` | Companion to local `$ref` (draft-dependent) |
| `format` | Built-ins include `date`, `date-time`, `duration`; argsbarg registers `comma-list` |
| `minimum` / `maximum` | Numbers and integers |
| `minLength` / `maxLength` | Strings |
| `pattern` | String regex (ECMAScript) |

## Partial validation

`validateConfigDocumentPartial` validates **present keys only** — all `required` arrays are stripped before validation. Used for `configure set` partial writes and bootstrap flows.

Leaf `inputSchema` validation uses full validation (including `required`) before the handler runs.

## Argsbarg-specific behavior

- Framework keys (`_bindings`, etc.) are omitted before config validation when `additionalProperties: false`.
- CLI `configure set` still coerces comma-separated primitives, booleans, and numbers before validation (`parseConfigSetValue`).

## Not guaranteed

- Remote `$ref` (`http://…`, other files)
- `default` application at validation time (defaults come from CLI option `default` or config bindings)

If schemagen emits keywords the validator rejects, simplify the TypeScript type or post-process the generated JSON Schema.

## Where validation runs

| Surface | Validator | When |
| --- | --- | --- |
| App config file | `validateConfigDocument` / `Partial` | `configure set`, config load |
| Leaf `inputSchema` | Same engine via leaf-inputs | Before handler (MCP/HTTP/CLI merged inputs) |
| `outputSchema` | Structural checks at program validate time | Startup / `cliValidateProgram` |

## Related docs

- [cli-program.md](cli-program.md) — `inputSchema`, JSON leaves, `ctx.inputs` / `ctx.inputsAs`
- [config-schema.md](config-schema.md) — `program.appConfig` and schemagen pipeline

Implementation: [`src/config/validate.ts`](../src/config/validate.ts), [`src/core/leaf-inputs.ts`](../src/core/leaf-inputs.ts).
