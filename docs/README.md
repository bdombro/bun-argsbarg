# Argsbarg documentation

Start here to pick the right guide.

| If you are… | Read |
| --- | --- |
| **New to argsbarg** | [../README.md](../README.md) — install, minimal usage, public API |
| **Authoring a `CliProgram`** (humans or agents) | [cli-program.md](cli-program.md) — schema, formats, headless, `read*Flags` |
| **JSON stdout / `outputSchema`** | [output-schema.md](output-schema.md) — codegen pipeline, JSDoc, narrowing |
| **App config / `program.appConfig`** | [config-schema.md](config-schema.md) — flat JSON file, `ctx.appConfig`, codegen |
| **Exposing MCP tools** | [mcp.md](mcp.md) — stdio server, `inputSchema`, varargs, `install --mcp` |
| **Shipping install / agent artifacts** | [install.md](install.md) — Homebrew + `myapp install --reinstall` |
| **Homebrew tap-from-repo distribution** | [distribution-homebrew.md](distribution-homebrew.md) — formula pattern, `argsbarg create` |
| **Bundling `myapp docs` topics** | [bundled-docs.md](bundled-docs.md) — consumer docgen vs framework docs |
| **Agent skills** | [ai-skills.md](ai-skills.md) — `install --skill`, `docs skill` |
| **Maintaining the argsbarg repo** | [developing.md](developing.md) — release, consumers, npm `files` |
| **Cursor / IDE agents in a consumer app** | `bunx argsbarg create` (includes rule) or `bun scripts/merge-cli-program-rule.ts .` from argsbarg checkout |
| **Runnable examples** (shipped in npm) | [examples/](examples/) — see table below |

## Examples (agents: read these)

Examples are included in the npm tarball (`package.json` `files`). After `bun add argsbarg`, open `node_modules/argsbarg/examples/`.

| Tier | Path | Use when |
| --- | --- | --- |
| Learn | [examples/minimal.ts](../examples/minimal.ts), [examples/nested.ts](../examples/nested.ts), [formats.ts](../examples/formats.ts) | One feature at a time |
| **Copy** | [examples/full-example/](../examples/full-example/) | Bootstrapping a production CLI (all builtins + schemagen + Homebrew justfile) |

## Framework docs vs consumer docgen

| Source | What it is | Where it lives |
| --- | --- | --- |
| **Framework docs** | How argsbarg works; authoring conventions | This directory — shipped in `node_modules/argsbarg/docs/` after `bun add argsbarg` |
| **Consumer docgen** | *Your* command tree, API, MCP guide for *your* app | `myapp docs api`, `docs schema`, `docs mcp` — written to `./docs/` with `--save` |
| **Cursor rule** | Thin tripwire telling agents to read framework docs | `node_modules/argsbarg/examples/full-example/.cursor/rules/cli-program.mdc` — included by `create`; refresh with `merge-cli-program-rule.ts` |

Agents do **not** load `node_modules/argsbarg/docs/` unless your repo references them (Cursor rule, `AGENTS.md`, or an `alwaysApply` project rule). Generated `./docs/api.md` in a consumer repo describes **your** CLI, not argsbarg itself.
