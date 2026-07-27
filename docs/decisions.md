# Decisions

This doc tracks big architectural decisions so that we can avoid re-hashing the same decisions over and over.

## HTTP REST vs flat `/tools/:name`

Decision: **nested `/api/...` REST** (7.0)

### Context

- v6 exposed tools as `POST /tools/:flat-name` with hyphen-joined paths
- Nested resources (e.g. `workspaces/{id}`) and verb-specific methods need a route model aligned with the CLI tree

### Rationale

1. Command tree already encodes hierarchy — REST paths mirror `http.segment ?? key` plus `:param` routers
2. Verb leaves (`get`, `post`, …) map to HTTP methods without duplicating path segments
3. OpenAPI paths match real URLs clients call; query/body binding matches MCP flat args
4. Hard break on `/tools/*` is acceptable pre-7.0-ship

## Validation: JSON-SCHEMA vs Zod, etc

Decision: JSON-SCHEMA

### Context
- JSON-SCHEMA is an open standard to capture a schema in json
- Zod is the leading Typescript schema management library
- Others are similar or less good than Zod

### Rational
Zod may actually cause more complexity and little/no gain for consumers. 

Yes Zod implements some features we do custom for JSON-SCHEMA, but is opinionated, less flexible, and would actually explode complexity in some situations. Zod could be a win for consumers if they require substantial, complex validation -- but then that may not convert well to json-schema anyways and json-schema generation is a big win.

1. Argsbarg does a lot of schema patching/manipulation to create different schemas per target (cli-schema.json, MCP contract, openapi.json). This would be harder with Zod
2. Consumers can use Zod by converting to JSON Schema (`zod-to-json-schema`, `z.toJSONSchema()`) and passing the result to `inputSchema` / `appConfig.jsonSchema`. Argsbarg resolves the validator draft from each schema’s `$schema` (Draft-07 default; 2019-09 / 2020-12 when set).
3. For uses like API pass-through, proxy, dynamic schemas, Zod may actually explode complexity for consumers.
4. Our TS->json-schema approach is actually easier and better in many cases
  - Just write plain typescript, done.
  - Better intellisense -- substantially less abstraction/inference, much better control

## Structured logging (ECS Logging)

Decision: **ECS Logging–compatible NDJSON to stderr** (default), with optional `enrich` / `serialize` hooks

### Context

- HTTP/MCP servers need access logs, error logs, and trace correlation in production log pipelines
- Consumers may need custom fields (team labels, vendor-specific shapes) without baking proprietary formats into argsbarg core
- OpenTelemetry log export is out of scope for the framework runtime (no third-party observability SDK dependency)

### Rationale

1. **ECS Logging** is an open standard (NDJSON, `ecs.version`, canonical field names) — works with Elasticsearch, Datadog, GCP log agents, etc.
2. **stderr + JSONL** keeps stdout free for CLI output and matches twelve-factor log collection
3. **W3C Trace Context** (`traceparent`) enables cross-service correlation without vendor-specific field layouts
4. **`program.log.enrich`** — additive hook for consumer-specific fields; cannot override the ECS baseline
5. **`program.log.serialize`** — escape hatch for full custom lines in consumer repos (argsbarg does not endorse that output as ECS)
6. **No Tyson / OTel SDK in core** — proprietary or heavy observability stacks belong in consumer config or infra (Fluent Bit remapping), not in the open-source framework