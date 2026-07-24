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
2. Consumers can already use zod if they want by using Zod's to-json-schema features to convert when passing to Argsbarg. So we aren't actually alienating / thwarting consumers from using Zod anyways.
3. For uses like API pass-through, proxy, dynamic schemas, Zod may actually explode complexity for consumers.
4. Our TS->json-schema approach is actually easier and better in many cases
  - Just write plain typescript, done.
  - Better intellisense -- substantially less abstraction/inference, much better control