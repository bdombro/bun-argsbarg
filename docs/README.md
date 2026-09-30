# Argsbarg documentation

Start here to pick the right guide.

| If you are… | Read |
| --- | --- |
| **New to argsbarg** | [../README.md](../README.md) — install, minimal usage, public API |
| **Authoring a `Program`** (humans or agents) | [cli-program.md](cli-program.md) — schema, formats, headless, `read*Flags` |
| **JSON stdout / `outputSchema`** | [output-schema.md](output-schema.md) — codegen pipeline, JSDoc, narrowing |
| **App config / `appConfig`** | [config-schema.md](config-schema.md) — flat JSON file, `ctx.appConfig`, codegen |
| **Schemas (Zod)** | [json-schema-subset.md](json-schema-subset.md) — authoring `inputSchema` / `outputSchema` / `appConfig.schema` in Zod 4; emitted as JSON Schema 2020-12 |
| **Exposing MCP tools** | [mcp.md](mcp.md) — stdio server, `inputSchema`, varargs, `configure install` |
| **HTTP tool server** | [http-server.md](http-server.md) — `myapp http`, endpoints, curl examples |
| **Server logging** (`log`, `enrich`, `serialize`) | [logging.md](logging.md) — ECS JSON lines, trace headers, custom formats |
| **Shipping configure / agent artifacts** | [configure.md](configure.md) — Homebrew + `myapp configure install` |
| **Homebrew tap-from-repo distribution** | [distribution-homebrew.md](distribution-homebrew.md) — formula pattern, `argsbarg create` |
| **Bundling `myapp docs` topics** | [bundled-docs.md](bundled-docs.md) — consumer docgen vs framework docs |
| **Agent skills** | [ai-skills.md](ai-skills.md) — repository skills (`skills/<app>/SKILL.md`) |
| **Maintaining the argsbarg repo** | [developing.md](developing.md) — release, consumers, npm `files` |
| **IDE agents in a consumer app** | `bun x argsbarg@latest create` (includes `AGENTS.md`) or `bun scripts/merge-agents-md.ts .` from argsbarg checkout |
| **Runnable examples** (shipped in npm) | [examples/](examples/) — see table below |

## Examples (agents: read these)

Examples are included in the npm tarball (`package.json` `files`). After `bun add argsbarg`, open `node_modules/argsbarg/examples/`.

| Tier | Path | Use when |
| --- | --- | --- |
| Learn | [examples/minimal.ts](../examples/minimal.ts), [examples/nested.ts](../examples/nested.ts), [formats.ts](../examples/formats.ts) | One feature at a time |
| **Copy (CLI)** | [examples/cli/](../examples/cli/) | Default `create` template — all builtins, Homebrew justfile; options/flags only |
| **Copy (JSON)** | [examples/api/](../examples/api/) | `create --template api` — Zod schemas, `command`, REST CRUD, SQLite |

## Framework docs vs consumer docgen

| Source | What it is | Where it lives |
| --- | --- | --- |
| **Framework docs** | How argsbarg works; authoring conventions | This directory — shipped in `node_modules/argsbarg/docs/` after `bun add argsbarg` |
| **Consumer docgen** | *Your* command tree, API, MCP guide for *your* app | `myapp docs cli`, `docs cli-schema`, `docs mcp` — written to `./docs/` with `--save` |
| **Agent instructions** | Inlined argsbarg authoring rules in `AGENTS.md` | `node_modules/argsbarg/examples/api/AGENTS.md` — merge default for consumers; `create` includes a template copy |

Agents do **not** load `node_modules/argsbarg/docs/` unless your repo references them (`AGENTS.md`, or an always-on project rule). Generated `./docs/cli.md` in a consumer repo describes **your** CLI, not argsbarg itself.
