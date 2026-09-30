# Design decisions

Why argsbarg is shaped the way it is, from the broadest choice to the narrowest. Each section gives the decision, the reasons, and what it costs. Decisions that have been reversed are removed; git history has them.

## 1. Scope: parse, serve, and package — nothing else

**Decision.** The core parses and routes commands, validates input with Zod, serves HTTP and MCP, prints plain-text help and shell completions, and packs MCP plugins and bundles. App settings, MCP client installs, self-update, generated docs, and agent skills belong to the app or its template. Startup rejects the removed root fields (`appConfig`, `configure`, `docs`) with a migration message.

**Why.** Through 8.0 the core also managed a config file and setup wizard, wrote MCP client configs, self-updated Homebrew installs, generated docs and a pointer skill, and drew boxed, colored help. Each of these was app policy that consumers either didn't use or overrode, and together they were a large share of the code, the docs, and startup validation. Committed generated docs also drifted from the code they described.

**Cost.** Apps that relied on `configure` or `docs` topics now carry that code themselves, and users set up MCP clients by hand or through a plugin. In return the API and docs are smaller, argsbarg writes no files outside `dist/`, and help and tool schemas have one source each (`--help`, `tools/list`, `/openapi.json`).

## 2. Runtime: Node first

**Decision.** The published package runs on Node ≥ 20; Bun runs the same build.

- Runtime code uses only `node:` APIs (`node:http` behind a small Fetch adapter, `node:child_process`, `node:fs`, `process.stdin`). The typecheck uses Node's types only, so a Bun-only API fails `tsc`.
- `tsc -p tsconfig.build.json` emits `dist/` (JS, per-file declarations with maps, source maps). `exports` exposes only `"."` → `dist/`, every runtime loads `dist/`, and `src/` isn't published. The `argsbarg` bin is `dist/cli-tool/main.js`.
- Development uses the same toolchain: npm, TypeScript 7, and `node --test` on type-stripped `.ts` (so only erasable syntax — the option enums are `as const` objects). The npm templates follow it; only the `homebrew` template keeps Bun, because it compiles a single binary.
- Inputs are JSON; YAML input was dropped rather than ported.

**Why.** argsbarg started Bun-only. But most CLI users install tools with npm or npx and already have Node, and agent hosts (Claude Desktop `.mcpb`, plugin marketplaces) launch servers with Node. The Bun-only APIs in use (`Bun.serve`, `Bun.spawn`, `Bun.YAML`, `Bun.stdin`) were a small, contained surface, so requiring Bun cost more reach than it saved.

**Cost.** A build step (`just build`) before local `file:` installs, which consumers install with `npm install --install-links` and must reinstall after argsbarg changes; `node:http` instead of `Bun.serve`.

## 3. Schemas: Zod in, JSON Schema out

**Decision.** Apps author schemas in Zod 4 (a peer dependency). argsbarg validates with Zod and emits JSON Schema (draft 2020-12) through `z.toJSONSchema` for MCP, OpenAPI, and help. JSON Schema stays the internal presentation format, so the wire transforms (MCP root wrapping, OpenAPI `$ref` inlining, help rendering) don't depend on Zod; one adapter module imports Zod at runtime. `command()` infers `ctx.inputs` and handler return types from the schemas.

**Why.** Before 8.0, contracts were JSON Schema generated from TypeScript by `ts-json-schema-generator` and validated with `@cfworker/json-schema`. In practice:

- Every consumer carried a codegen step whose artifacts drifted from the types; one committed 14 generated files.
- The generator put `typescript` and seven other packages in every consumer's production dependencies.
- Consumers that wanted their own validation added a second validator.
- Union errors needed about 300 lines of narrowing to be readable, and handlers cast `ctx.inputsAs<T>()` with no link to the schema.

A spike that ported gdocsmith's contracts to Zod produced equivalent types, emitted schemas 37–50% smaller, and matching descriptions.

**Cost.**

- Descriptions move from JSDoc to `.describe()`, because Zod doesn't read JSDoc.
- `z.object` silently strips unknown keys; argsbarg warns at MCP/HTTP startup, and the templates use `z.strictObject`.
- Refinements validate at runtime but don't appear in the emitted schema, so agents see a looser contract than the one enforced.
- argsbarg depends on Zod 4's `toJSONSchema`. The single adapter module keeps a move to Standard Schema a one-file change.

## 4. Logging: ECS JSON on stderr

**Decision.** HTTP and MCP servers write access and error logs to stderr as Elastic Common Schema (ECS) NDJSON by default. Apps add fields with `log.enrich` or replace the line format with `log.serialize`.

**Why.** Production servers need trace-correlated logs that standard collectors (Elasticsearch, Fluent Bit, Datadog, GCP) read without mapping, and we didn't want a heavy observability SDK in the library. ECS fields (`ecs.version`, `log.level`, …) are widely understood; stderr keeps stdout free for command output; W3C `traceparent` headers are parsed and propagated without a proprietary format.

**Cost.** A deployment standardized on a non-ECS layout needs a collector mapping or a custom `serialize`.
