# Made with /thread-memory

## Meta
updated: 2026-09-15 21:06
id: b680df49-7bbc-4cbe-93a4-becb3e0a10f6
scope: src/core/parse.ts, src/core/parse.test.ts, CHANGELOG.md
topics: interleaved-positional-options, finishLeaf, leaf-local-options, positional-parsing
counts: 2 decision, 1 rejected

## 2026-09-15 21:06 decision
Interleaved options between bounded and optional positionals
context: Consumers reported strict argument ordering issues where flags placed between positionals (e.g. `cmd file1 --force file2`) failed with "Unexpected extra arguments" or were swallowed into positional slots, whereas varargs tails already allowed flags in-between.
decision: Refactored `finishLeaf` in `src/core/parse.ts` to consume pending options before each positional, between bounded positionals, inside vararg loops, and at the end of the argument list. Encountering `--` stops option processing and treats subsequent tokens strictly as positionals. Contextual help (`-h` / `--help`) works at any position.
paths: src/core/parse.ts, src/core/parse.test.ts, CHANGELOG.md

## 2026-09-15 21:06 rejected
Allowing root options after subcommand tokens
rejected: Falling back to check root-level options when an unknown option is encountered on a leaf or subcommand (e.g. `myapp subcmd --root-flag`).
instead: Maintain strict leaf-local option isolation introduced in v8.0 to prevent bloat and confusion across MCP tools, HTTP REST payloads, and OpenAPI schemas. Common flags needed on multiple commands should be declared directly on leaf commands via shared constants.

## 2026-09-15 21:06 decision
Comprehensive interleaved option test coverage
context: Needed validation for presence flags, value options, multiple interleaved options, unknown option errors, contextual help, and `--` escaping across single, multiple, optional, and varargs positionals.
decision: Added test cases to `src/core/parse.test.ts` verifying that flags and options interleave seamlessly across bounded positionals, optional positionals, and bounded positionals paired with varargs tails.
paths: src/core/parse.test.ts
