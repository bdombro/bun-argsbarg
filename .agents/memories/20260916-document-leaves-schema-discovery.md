# Made with /thread-memory

## Meta
updated: 2026-09-16 13:50
id: e5229fba-b706-4a8a-a4ff-5fbc705a405c
scope: src/**, docs/**, examples/**, CHANGELOG.md
topics: document-leaves, yaml-parsing, schema-discovery, non-tty-help, wire-schema, cli-schema-export, consumers-sync
counts: 4 decision, 1 rejected, 1 footgun

## 2026-09-16 06:30 decision
In-band YAML schema discovery and unboxed help in non-TTY
context: AI agents running CLI commands need immediate schema contracts without consulting separate docs or files; TTY boxes cause formatting noise for agents.
decision: In non-TTY environments (pipes, scripts, agent subshells), --help strips rounded box borders, emits plain indented text, and appends full untruncated YAML Output Schema (and Input Schema on document leaves). TTY mode retains compact UTF-8 boxes and omits schemas by default. Added schemaToYamlLines helper with $ref resolution, cycle detection, comments, and optionality markers.
paths: src/help.ts, src/help.test.ts, docs/output-schema.md, README.md, CHANGELOG.md

## 2026-09-16 06:50 decision
Renamed kind: "json" to kind: "document" with dual YAML/JSON parsing
context: kind: "json" leaves accepted only JSON, preventing ergonomic multi-line YAML input from CLI and HTTP callers; naming was tied to JSON rather than structured documents.
decision: kind: "document" is the primary type; kind: "json" and isJsonLeaf() are retained as fully backward-compatible aliases. Added parseDocumentText() with JSON fast-path + fallback to Bun.YAML.parse(). Document leaves accept single-token JSON or YAML from argv or piped stdin. HTTP server parses request bodies as JSON or YAML for document endpoints. Help displays [DOCUMENT] for document leaves and updates stdin hint.
paths: src/core/types.ts, src/core/leaf-inputs.ts, src/core/validate.ts, src/core/parse.ts, src/http/server.ts, src/http/routes.ts, src/http/openapi.ts, src/help.ts, src/core/document-leaf.test.ts, src/core/json-leaf.test.ts, src/test/integration/http.test.ts, docs/cli-program.md, CHANGELOG.md

## 2026-09-16 07:00 footgun
CLI agent invocation syntax confusion on JSON schema in help
fails: If --help displays a YAML or JSON Input Schema: on standard flag-based CLI commands, LLM coding agents often infer that the command accepts a JSON/YAML string positional or piped stdin, attempting cmd '{"flag":"val"}' instead of cmd --flag val.
paths: src/help.ts

## 2026-09-16 07:05 decision
Consumer sync to argsbarg 7.0.9
context: Consumers (sqsp-workspaces, sqsp-qa-manager-poc, sqsp-i18n-tools-poc) need the latest unboxed non-TTY help, YAML schema discovery, and document leaf support.
decision: Ran just consumers-sync to bump dependency to argsbarg@^7.0.9, regenerate schemagen and CLI docs, recompile binaries, and reinstall via Homebrew across all three consumer checkouts.
paths: justfile, package.json

## 2026-09-16 10:20 rejected
Auto-generating and printing Input Schema in CLI --help for flag-based commands
rejected: Printing a YAML/JSON Input Schema block in CLI --help for flag commands (kind != "document").
instead: CLI --help is strictly the shell invocation guide; the Options: and Arguments: tables already describe syntax and types. Printing an Input Schema for flag commands confuses agents into passing or piping JSON strings instead of flags, creates kebab-case vs object-key mismatches, and duplicates information. Input schemas for flag commands belong exclusively in machine-facing schemas (docs cli-schema, OpenAPI, MCP tools).

## 2026-09-16 10:30 decision
Canonical buildLeafInputSchema and leaf inputSchema in docs cli-schema
context: MCP and OpenAPI duplicated input schema generation; docs cli-schema (cli-schema.json) omitted inputSchema for flag-based commands, leaving programmatic callers without a unified input schema.
decision: Extracted buildLeafInputSchema() and leafWireOptions() to src/core/wire-schema.ts. When leaf.inputSchema is set, it is returned directly; otherwise, synthesizes an object JSON Schema from leaf-local wire options and positionals. Added inputSchema to CliSchemaExport so cliSchemaExport() populates it for every leaf command in docs cli-schema and <app>://schema MCP resource. Deduplicated MCP collectMcpTools and HTTP generateOpenApi.
paths: src/core/wire-schema.ts, src/core/schema.ts, src/builtins/export.ts, src/mcp/tools.ts, src/http/openapi.ts, src/exports/cli.ts, src/index.ts, src/core/wire-schema.test.ts, src/docs/cli-guide.test.ts, examples/full-example/docs/cli-schema.json, examples/full-example-json/docs/cli-schema.json, CHANGELOG.md
