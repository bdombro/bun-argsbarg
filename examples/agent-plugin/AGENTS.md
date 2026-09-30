# example-agent-plugin

<!-- argsbarg:managed — overwritten on merge; framework baseline; app-specific sections below take precedence -->

> **Baseline framework rules:** The conventions below are defaults for argsbarg projects. Project-specific sections below this managed block override these defaults.

## Argsbarg schema

When adding or changing argsbarg schema, command handlers, or MCP exposure:

1. **Read** `node_modules/argsbarg/docs/cli-program.md` (required — authoritative guide).
2. MCP tools, varargs, `inputSchema` → also `node_modules/argsbarg/docs/mcp.md`.
3. JSON stdout / `outputSchema` (Zod) → `node_modules/argsbarg/docs/output-schema.md`; authoring schemas → `node_modules/argsbarg/docs/json-schema-subset.md`.
4. App config / `appConfig.schema` (Zod) → `node_modules/argsbarg/docs/config-schema.md`.
5. `configure`, `configure.targets`, Homebrew distribution → `node_modules/argsbarg/docs/configure.md` and `distribution-homebrew.md`.
6. Bundled `docs` built-in → `node_modules/argsbarg/docs/bundled-docs.md`.
7. **Examples** (shipped under `node_modules/argsbarg/examples/`):
   - **CLI copy template** (all builtins, Homebrew justfile, options/flags only) → `examples/cli/`
   - **Schema-first copy template** (Zod `inputSchema`/`outputSchema` via `command`, REST CRUD) → `examples/api/`

**Hard rules** (details and examples are in the docs above — do not contradict them):

- Reserved root commands: `completion`, `configure`, `mcp`, `version`, `docs`.
- `argsbarg({ … })` builds the app (`src/app.ts`) and `command({ … })` declares every command (typed `ctx.inputs` / `ctx.pathParams`); action-oriented `description` on root, commands, options, and positionals.
- Omit `mcpTool` unless genuinely CLI-only (`enabled: false`) or an irreducible wire limit — fix schema and headless handlers first.
- Interactive commands: one headless path for MCP, non-TTY CLI, and `--yes` / `--dry-run` / `--json` (`shouldRunHeadless*`, `requireYesInNonTty`); not raw `isTTY`.
- String options: `format` / `default` / `pattern` per `cli-program.md`; `ctx.inputs` for multi-flag commands.
- Varargs (`argMax: 0`): CLI space-separated; MCP JSON array only — no comma-splitting positionals.
- Multi-surface commands (Ink + headless + MCP): one **`read*Flags(ctx)`** per command (or shared family helper + extensions); one **`resolve*Input(flags)`** for cross-field rules — handler reads ctx once, all paths share the struct.
- Schemas: Zod in the command's `types.ts` — export the schema and a same-named `z.infer` type (`export const StatusJsonOutput = z.strictObject({…}); export type StatusJsonOutput = z.infer<typeof StatusJsonOutput>`). Prefer `z.strictObject`; put every field's documentation in `.describe("…")` (agents read it; JSDoc is not emitted).
- Commands with `inputSchema` / `outputSchema` use `command({…})` so `ctx.inputs` and the return value are typed; path params come from `ctx.pathParams`.
- App config (optional): `appConfig.schema` takes a Zod object schema from `src/config/types.ts`.

## Code conventions

### JSDoc

Add doc comments for exported surfaces that are not obvious from the name alone: JSON output schemas, public types, and non-trivial algorithms. Skip comments on short test callbacks and pure re-export files.

### Names

Use names that describe the domain role, not generic placeholders like `data` or `handler`, except in very small scopes.

### Structure

After imports, put **exported** symbols first (alphabetical within each kind), then **module-private** helpers at the bottom. Use `~/…` only where you would otherwise use `../` (or deeper) to reach another module under `src/`. Same-directory (`./`) and child (`./foo/…`) imports stay relative. Use `.ts` extensions.

### Module boundaries

| Path | Owns | Must not |
| --- | --- | --- |
| `src/index.ts` | Thin entry: `await app.run()` | Inline command handlers, business logic |
| `src/types/` | Global type declarations and module augmentations (e.g. `argsbarg.d.ts`, `md.d.ts`) | Runtime logic, imports from outside `types/` |
| `src/app.ts` | `Program` assembly: `docs`, `commands: […]` | Inline command handlers, business logic |
| `src/db/` | `AppDb` (SQLite connect, migrate, domain access), `migrate.ts`, `migrations/*.sql` | Command handlers |
| `src/commands/<name>/` | One user-facing command: `command.ts`, optional `types.ts` with Zod schemas | Shared helpers (lift to `src/db/`) |
| `scripts/` | Dev tooling (formula helpers) | Production command paths |

When adding commands: `src/commands/<name>/command.ts` + `types.ts` when schemas are needed; register in `app.ts` **alphabetically by command key**.

**Argsbarg schema:** see Argsbarg schema section above.

### Execution

- **Runtime:** Bun (`just test`, `just dev`).
- **Tests:** colocate `*.test.ts` next to the module.
- **Repository skill:** When adding, renaming, or removing commands, update `skills/<key>/SKILL.md` so the intent-based command group remains accurate for end-user agents. (`just docgen` updates `./docs/` only and never overwrites `skills/`).

### Abstractions

Avoid needless extraction: keep single-use helpers in the calling file by default. Split only when reused elsewhere, the caller is large or hard to follow, or extraction clarifies a substantial unit. Do not create tiny one-off helpers.
- ❌ `utils/formatX.ts` — 60-line helper used by one command
- ✅ inline helper in that command file

<!-- /argsbarg:managed -->

## Tooling

- Use Bun for development, tests, and bundling (`bun`, `bun x`, `bun test`).
- Plugins run the committed Node bundle `dist/example-agent-plugin.mjs` via inline manifest MCP configs. `just check` rebuilds it; commit it with its source and never hand-edit it.
- Keep the MCP runtime Node-compatible: no Bun-only APIs (`Bun.serve`, `bun:sqlite`) on MCP paths. stdout is the MCP protocol.

## Testing Boundaries

- Use the cheapest test level that establishes the behavior. Reuse existing tests and helpers.
- Unit/offline: deterministic parsing, validation, state changes, and request planning. Keep these tests independent of live services and paid agents.
- Integration: contracts unit tests cannot establish, such as clean plugin installation, MCP startup/transport, or actual external persistence. Do not duplicate unit coverage with live calls.
- Agent E2E: safe user-task completion and agent efficiency. Check outcomes and protected content, not exact tool-call sequences or exhaustive protocol details. Run explicitly, never as part of the default unit test command.
- When E2E exposes a tool bug, reproduce and fix it in unit tests first; use integration only where necessary. Check verifier changes offline against retained or synthetic evidence before another paid run.
- Attribute agent failures and recovery from observable evidence. A failed call alone does not establish task failure or a tool defect.

## Documentation

- `README.md` — user-facing install/commands
- `docs/architecture.md` — maintainer internals (create if missing)
- Generated: `just docgen` → `docs/cli.md`, `docs/cli-schema.json`
- `skills/example-agent-plugin/SKILL.md` — agent skill command group (scaffolded from template; customize as needed)

## App conventions

Replace with app-specific bullets.
