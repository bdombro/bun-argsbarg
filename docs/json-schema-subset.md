# JSON Schema subset

Argsbarg validates `program.appConfig`, leaf `inputSchema`, and related documents with a **custom Draft-07 subset** in [`src/config/validate.ts`](../src/config/validate.ts). There is no runtime dependency on a full JSON Schema validator.

Use this page when authoring schemas for config files, `inputSchema` on leaves, or `@sg` schemagen output.

## Supported constructs

| Feature | Notes |
| --- | --- |
| `type` | `object`, `array`, `string`, `integer`, `number`, `boolean`, `null` |
| `properties` / `required` | Object keys; `additionalProperties: false` enforced when set |
| `items` | Homogeneous arrays; comma-separated CLI strings coerced when `items` is a primitive |
| `enum` / `const` | Exact value checks |
| `anyOf` / `oneOf` | First matching branch wins; errors surface when none match |
| `$ref` | **Local only** — `#/definitions/Name` resolved within the same root document |
| `definitions` | Companion to local `$ref` |
| `format` | `date`, `date-time`, `duration`, `comma-list` (and related string coercions) |
| `minimum` / `maximum` | Numbers and integers |
| `minLength` / `maxLength` | Strings |
| `pattern` | String regex (ECMAScript) |

## Partial validation

`validateConfigDocumentPartial` validates **present keys only** — root `required` is skipped. Used for `configure set` partial writes and bootstrap flows.

Leaf `inputSchema` validation uses full validation (including `required`) before the handler runs.

## Not supported (today)

- Remote `$ref` (`http://…`, other files)
- `allOf`, conditional (`if`/`then`/`else`), `not`
- Unevaluated / dynamic references
- `default` application at validation time (defaults come from CLI option `default` or config bindings)

If schemagen emits an unsupported keyword, simplify the TypeScript type or post-process the generated JSON Schema.

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
