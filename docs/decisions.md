# Architecture Decision Records (ADRs)

This document records the key architectural decisions made during the design and implementation of ArgsBarg.

---

## ADR 1: Exclusively Support Bun as the JavaScript/TypeScript Runtime

### Status

Accepted

### Context

We evaluated whether to build ArgsBarg as a dual-runtime library supporting both Node.js and Bun, or to target Bun exclusively. 

Supporting Node.js requires maintaining complex build steps (transpilation, bundlers, CommonJS vs ESM dual-packaging, polyfills for HTTP serving) and limits the features we can offer to both the library and its consumers.

### Decision

Exclusively support Bun as the sole runtime for ArgsBarg and its consumer applications.

### Consequences

- **Pros:**
  - **Zero-Build, Source-First Architecture:** Because Bun executes TypeScript and TSX directly from source, consumers can run their source code directly in production without any transpile or bundling steps (no Babel, Webpack, `ts-node`, or `tsx` required).
  - **High-Performance Native HTTP (**`Bun.serve`**):** ArgsBarg's HTTP REST server is built directly on top of Bun's native, ultra-fast HTTP stack, offering millisecond-range startup times and massive throughput out of the box with zero boilerplate.
  - **Native File and Text Imports:** ArgsBarg leverages Bun's native import attributes (e.g., `import readmeText from "./README.md" with { type: "text" }`) to bundle documentation and schemas at compile-time without reading the filesystem at runtime or requiring custom bundler plugins.
  - **Unified, Lightweight Toolchain:** Both the framework and consumers benefit from Bun's native, ultra-fast package manager, built-in test runner (`bun test`), and zero-config TypeScript support, keeping the project's footprint and developer friction incredibly low.
- **Cons (What We Lose):**
  - **Loss of Node-Only Enterprise Tooling:** We lose out-of-the-box integration with legacy enterprise APMs (Application Performance Monitoring like Datadog, New Relic) and security/compliance scanners that are strictly compiled for Node.js runtimes or depend on Node's internal V8 debugging APIs.
  - **Serverless Platform Friction:** Standard serverless platforms (e.g., AWS Lambda, Google Cloud Functions) have optimized native runtimes for Node.js, whereas running Bun on these platforms requires deploying custom layers or heavier Docker containers.
  - **Reduced Addressable Library Adoption:** By locking out standard Node.js environments, we lose a significant portion of the mainstream Node.js developer base who cannot adopt Bun due to rigid corporate policies, legacy infrastructure, or strict compliance guidelines.
  - **100% Node API Compatibility Guarantee:** While Bun's Node compatibility layer is exceptionally high, we lose the 100% absolute guarantee that legacy CommonJS packages or complex native C++ addons (N-API) will run flawlessly without minor polyfill adjustments.
  - **No Node.js Execution Path:** Applications cannot run on standard Node.js without a separate bundling/transpilation layer, making ArgsBarg a Bun-exclusive framework.

---



## ADR 2: Schema-Driven Contracts via JSON Schema (vs Zod)



### Status

Superseded by [ADR 4](#adr-4-zod-as-the-schema-authoring-and-validation-layer) (argsbarg 8.0)

### Context

We evaluated schema management and runtime validation libraries—specifically comparing the TypeScript-first library **Zod** against the industry-standard **JSON Schema** specification—for input and configuration contracts.

### Decision

Adopt JSON Schema (using `@cfworker/json-schema` and `ts-json-schema-generator`) as the core validation format.

### Consequences

- **Pros:**
  - **Dynamic Manipulation:** Allows ArgsBarg to dynamically slice, patch, and transform schemas at runtime for different targets (CLI parser, MCP tools, OpenAPI JSON, and app configuration). This is far more complex to do with Zod.
  - **Tooling Parity:** Integrates cleanly with a "write TypeScript, compile to schema" developer workflow.
  - **Better IntelliSense:** Users write plain TypeScript interface definitions rather than chained Zod schemas, resulting in cleaner code and zero-abstraction IntelliSense.
  - **Interop:** Consumers who prefer Zod can still use it and convert their schemas via `zod-to-json-schema` before passing them to ArgsBarg.
- **Cons:**
  - Fewer expressive, runtime-only custom validation features (like refinements and transformations) built into the framework core.

---



## ADR 3: Structured Logging (ECS-Compatible JSON)



### Status

Accepted (v6.1.9)

### Context

HTTP and MCP servers require standard, trace-correlated, and easily digestible access and error logging for production pipelines (such as Datadog, Elasticsearch, and GCP logs). We wanted to deliver first-class, standard-compliant logs out of the box without introducing heavy third-party observability libraries or proprietary schemas.

### Decision

Emit server access and error logs to `stderr` formatted as Elastic Common Schema (ECS)-compatible NDJSON by default, with optional `program.log.enrich` and `program.log.serialize` hooks.

### Consequences

- **Pros:**
  - **Industry Standard:** ECS-compatible fields (`ecs.version`, `log.level`, etc.) play perfectly with all standard log collectors (ELK, Fluent Bit, Datadog).
  - **Twelve-Factor Native:** Writing structured JSON to `stderr` keeps `stdout` clean for CLI command payloads and output redirects.
  - **Distributed Tracing:** Standard W3C `traceparent` headers are automatically parsed and propagated without proprietary metadata layouts.
  - **Zero Heavy Dependencies:** Avoids bundling heavy OpenTelemetry SDKs or other binary telemetry clients in the core open-source library.
- **Cons:**
  - Requires minor log collector or format mapper adjustments if the deployment environment is strictly standardized on a non-ECS log layout.

---

## ADR 4: Zod as the Schema Authoring and Validation Layer

### Status

Accepted (8.0.0). Supersedes ADR 2.

### Context

ADR 2 used JSON Schema as the contract, generated from TypeScript with `ts-json-schema-generator` (`argsbarg schemagen`, `/** @sg */` markers, `__generated__/` artifacts) and validated with `@cfworker/json-schema` plus argsbarg's own union-error narrowing. In practice:

- Every consumer carried a codegen step and generated artifacts that drifted from types. One consumer committed 14 generated files.
- The generator pulled `typescript` and seven other packages into every consumer's production dependency tree.
- Consumers that wanted their own validation added a second validator.
- Union errors needed about 300 lines of narrowing to be readable.
- Handlers cast `ctx.inputsAs<T>()` with no link to the schema.

A spike ported gdocsmith's contracts to Zod 4: the inferred types were equivalent, the emitted schemas were 37–50% smaller, and descriptions reached parity.

### Decision

Author schemas in Zod 4 (a peer dependency). argsbarg validates with Zod and emits JSON Schema (draft 2020-12) via `z.toJSONSchema` for MCP, OpenAPI, help, schema export, and config coercion. JSON Schema remains the internal presentation format, so every wire-format transform (MCP root wrapping, OpenAPI `$ref` inlining, help YAML) is unchanged. Only one adapter module imports Zod at runtime. `command()` infers `ctx.inputs` and handler returns from the schemas.

### Consequences

- **Pros:**
  - No codegen step, generated artifacts, or drift; consumers reuse the same schemas for their own validation.
  - Fewer and lighter dependencies (no TypeScript chain at runtime); smaller wire schemas.
  - Typed handlers (`command`) and precise native union errors (`z.discriminatedUnion`).
  - Unrepresentable schemas fail at startup instead of shipping a wrong contract.
- **Cons:**
  - Descriptions move from JSDoc to `.describe()`, so authors must copy documentation explicitly (Zod does not read JSDoc).
  - `z.object` strips unknown keys silently; argsbarg warns at MCP/HTTP startup and the templates use `z.strictObject`.
  - Refinements validate at runtime but do not appear in emitted JSON Schema, so agents see a looser contract than the one enforced.
  - Tied to Zod 4's `toJSONSchema`. The adapter boundary keeps a later move to Standard Schema / Standard JSON Schema a one-module change.

