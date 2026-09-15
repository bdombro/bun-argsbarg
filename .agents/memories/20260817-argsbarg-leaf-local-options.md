# Made with /thread-memory

## Meta
updated: 2026-08-17 16:28
id: ce9ba8c7-6040-40ba-b04d-568d8c983730
scope: src/**, docs/**, examples/**, CHANGELOG.md
topics: leaf-local-options, mcp-wire-schema, http-openapi, release-8.0, consumer-testing
counts: 4 decision, 4 rejected, 2 footgun, 1 open

## 2026-08-17 14:00 decision
Leaf-local options only (breaking 8.0)
context: Inherited/parent-scoped options are bad CLI design; one rule everywhere (CLI, MCP, HTTP), not consumer-config workarounds.
decision: Options apply only on the node where declared. collectOptionDefs returns leaf options only; collectPathOptionDefs validates root plus each path segment. Parse loop consumes current.options at each router level; flags must appear at or before the command level where declared. src/core/validate.ts errors when a non-root routing group declares options.
paths: src/core/parse.ts, src/core/validate.ts, src/core/parse.test.ts, CHANGELOG.md, docs/cli-program.md

## 2026-08-17 14:30 decision
MCP, HTTP, OpenAPI, and skill wire schemas stay lean
context: MCP tool schemas were bloated with inherited flags and inconsistent ordering.
decision: leafWireOptions exposes leaf-local options minus json, yes, verbose. MCP auto-injects --yes for mutating tools when the leaf has a yes option. collectMcpTools returns tools sorted alphabetically by name. Same leaf-local rule in src/http/openapi.ts, src/http/routes.ts, src/skill/generate.ts, docs/mcp.md.
paths: src/mcp/tools.ts, src/http/openapi.ts, src/http/routes.ts, src/skill/generate.ts, src/docs/mcp-guide.ts, src/docs/http-guide.ts, docs/mcp.md

## 2026-08-17 14:30 rejected
Consumer config for MCP option bloat
rejected: Per-app MCP schema tuning or option filtering in consumer programs.
instead: Framework handles lean wire schemas and --yes auto-inject automatically.

## 2026-08-17 14:30 rejected
MCP tool-count warnings
rejected: Runtime or schemagen warnings when an app registers many MCP tools.
instead: No tool-count guardrails in this release.

## 2026-08-17 14:30 rejected
mcpTool.name override
rejected: Per-leaf mcpTool.name override for custom MCP tool names.
instead: Deterministic naming from command path only.

## 2026-08-17 14:30 rejected
CLI-author consolidation docs
rejected: New docs telling CLI authors how to consolidate commands for MCP.
instead: Leaf-local rule is sufficient; no extra author guidance.

## 2026-08-17 15:00 decision
In-repo and template verification before release
context: Pre-release confidence check after leaf-local change.
decision: just test (483 pass) and just example-full-check both green on 2026-08-17. examples/nested.ts updated (--json on lookup leaf, wantsExplicitJson). Full-example templates still match argsbarg create --check.
paths: examples/nested.ts, src/test/integration/mcp.test.ts, src/test/integration/http.test.ts, justfile

## 2026-08-17 16:00 decision
Consumer matrix with file: linked argsbarg
context: just consumers-dev links local argsbarg into sqsp-workspaces, sqsp-qa-manager-poc, sqsp-i18n-tools-poc.
decision: sqsp-workspaces 179/179 pass. sqsp-i18n 71 pass, 8 skip (live GitHub). sqsp-qa 177 pass, 1 fail (migrateLegacyAppConfig — not argsbarg). API subprocess smokes in sqsp-qa moved to src/smoke-test.ts (opt-in via just smoke-test) so default bun test ./src no longer hits QA Management API.
paths: justfile

## 2026-08-17 14:00 footgun
ctx.inputs omits program-root options under leaf-local parse
fails: loadLeafInputs uses collectOptionDefs (leaf-only). ctx.hasFlag still reflects parsed root flags, but ctx.inputs may not include values for options declared only on the program root when the handler reads ctx.inputs.
paths: src/core/leaf-inputs.ts, src/core/parse.ts

## 2026-08-17 16:00 footgun
userHome ignores HOME env var
fails: src/paths/host.ts userHome() uses TEST_USER_HOME or platform defaults (/Users/$USER, etc.) and never reads $HOME. Tests that set HOME expecting isolated config paths will write/read the real home unless they set TEST_USER_HOME.
paths: src/paths/host.ts

## 2026-08-17 16:10 open
Release 8.0.0 pending commit
open: Breaking leaf-local work is complete and tested in-repo; 17 files still uncommitted locally. Cut with just release major (not manual version bump) after commit. Then just consumers-sync to pin consumers to ^8.0.0.
paths: CHANGELOG.md, package.json, justfile
