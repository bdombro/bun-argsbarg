# example-cli

<!-- argsbarg:managed — overwritten on merge; framework baseline; app-specific sections below take precedence -->

> **Baseline framework rules:** The conventions below are defaults for argsbarg projects. Project-specific sections below this managed block override these defaults.

## Argsbarg schema

When adding or changing argsbarg schema, command handlers, or MCP exposure:

1. **Read** `node_modules/argsbarg/docs/cli-program.md` (required — authoritative guide).
2. MCP tools, varargs → `node_modules/argsbarg/docs/mcp.md`.
3. JSON stdout / `outputSchema` and Zod schemas → `node_modules/argsbarg/docs/output-schema.md` and `examples/api/`.
4. App config / `appConfig` → `node_modules/argsbarg/docs/config-schema.md`.
5. `configure`, Homebrew distribution → `node_modules/argsbarg/docs/configure.md` and `distribution-homebrew.md`.
6. Bundled `docs` built-in → `node_modules/argsbarg/docs/bundled-docs.md`.
7. **Examples** (shipped under `node_modules/argsbarg/examples/`):
   - **CLI copy template** (this repo) — builtins only, options/flags only
   - **Schema-first copy template** — Zod `inputSchema`/`outputSchema` via `command`, REST CRUD → `examples/api/`

**Hard rules** (details and examples are in the docs above — do not contradict them):

- Reserved root commands: `completion`, `configure`, `mcp`, `version`, `docs`.
- `argsbarg({ … })` builds the app (`src/app.ts`) and `command({ … })` declares every command (typed `ctx.inputs` / `ctx.pathParams`); action-oriented `description` on root, commands, options, and positionals.
- Omit `mcpTool` unless genuinely CLI-only (`enabled: false`) or an irreducible wire limit — fix schema and headless handlers first.
- Interactive commands: one headless path for MCP, non-TTY CLI, and `--yes` / `--dry-run` / `--json` (`shouldRunHeadless*`, `requireYesInNonTty`); not raw `isTTY`.
- String options: `format` / `default` / `pattern` per `cli-program.md`.
- Varargs (`argMax: 0`): CLI space-separated; MCP JSON array only — no comma-splitting positionals.

## Code conventions

### JSDoc

Add doc comments for exported surfaces that are not obvious from the name alone. Skip comments on short test callbacks and pure re-export files.

### Names

Use names that describe the domain role, not generic placeholders like `data` or `handler`, except in very small scopes.

### Structure

After imports, put **exported** symbols first (alphabetical within each kind), then **module-private** helpers at the bottom. Use `~/…` only where you would otherwise use `../` (or deeper) to reach another module under `src/`. Same-directory (`./`) and child (`./foo/…`) imports stay relative. Use `.ts` extensions.

### Module boundaries

| Path | Owns | Must not |
| --- | --- | --- |
| `src/index.ts` | Thin entry: `await app.run()` | Inline command handlers, business logic |
| `src/types/` | Global type declarations (e.g. `md.d.ts`) | Runtime logic |
| `src/app.ts` | `Program` assembly: `docs`, `commands: […]` | Inline command handlers, business logic |
| `src/commands/<name>/` | One user-facing command: `command.ts` | Shared helpers unrelated to the command |
| `scripts/` | Dev tooling (formula helpers) | Production command paths |

When adding commands: `src/commands/<name>/command.ts`; register in `app.ts` **alphabetically by command key**.

**Argsbarg schema:** see Argsbarg schema section above.

### Execution

- **CLI:** `bun ./src/index.ts …` or `just run …`
- **Tests:** `just test` (after `just check`)
- **Repository skill:** When adding, renaming, or removing commands, update `skills/<key>/SKILL.md` so the intent-based command group remains accurate for end-user agents. (`just docgen` updates `./docs/` only and never overwrites `skills/`).

### Abstractions

Avoid needless extraction: keep single-use helpers in the calling file by default. Split only when reused elsewhere, the caller is large or hard to follow, or extraction clarifies a substantial unit. Do not create tiny one-off helpers.
- ❌ `utils/formatX.ts` — 60-line helper used by one command
- ✅ inline helper in that command file

<!-- /argsbarg:managed -->

## Tooling

- Bun only (`bun`, `bun x`, `bun test`). No Node/npm/pnpm.

## Documentation

- `README.md` — user-facing install/commands
- `docs/architecture.md` — maintainer internals (create if missing)
- Generated: `just docgen` → `docs/cli.md`, `docs/cli-schema.json`
- `skills/example-cli/SKILL.md` — agent skill command group (scaffolded from template; customize as needed)

## App conventions

Replace with app-specific bullets.
