# full-example

## Tooling

- Bun only (`bun`, `bunx`, `bun test`). No Node/npm/pnpm.

## Documentation

- `README.md` — user-facing install/commands
- `docs/architecture.md` — maintainer internals (create if missing)
- Generated: `just docgen` → `docs/cli.md`, `docs/cli-schema.json`, `docs/skill.md`

<!-- argsbarg:managed -->

## Argsbarg schema

When adding or changing argsbarg schema, leaf handlers, or MCP exposure:

1. **Read** `node_modules/argsbarg/docs/cli-program.md` (required — authoritative guide).
2. MCP tools, varargs → `node_modules/argsbarg/docs/mcp.md`.
3. JSON stdout / `outputSchema` and `@sg` schemagen → `node_modules/argsbarg/docs/output-schema.md` and `examples/full-example-json/`.
4. App config / `program.appConfig` → `node_modules/argsbarg/docs/config-schema.md`.
5. `configure`, Homebrew distribution → `node_modules/argsbarg/docs/configure.md` and `distribution-homebrew.md`.
6. Bundled `docs` built-in → `node_modules/argsbarg/docs/bundled-docs.md`.
7. **Examples** (shipped under `node_modules/argsbarg/examples/`):
   - **CLI copy template** (this repo) — builtins only, no schemagen
   - **Schema-first copy template** — `@sg`, `inputSchema`/`outputSchema`, REST CRUD → `examples/full-example-json/`

**Hard rules** (details and examples are in the docs above — do not contradict them):

- Reserved root commands: `completion`, `configure`, `mcp`, `version`, `docs`.
- `satisfies CliProgram` / `CliLeaf`; action-oriented `description` on root, commands, options, and positionals.
- Omit `mcpTool` unless genuinely CLI-only (`enabled: false`) or an irreducible wire limit — fix schema and headless handlers first.
- Interactive leaves: one headless path for MCP, non-TTY CLI, and `--yes` / `--dry-run` / `--json` (`shouldRunHeadless*`, `requireYesInNonTty`); not raw `isTTY`.
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
| `src/index.ts` | Thin entry: `new Cli(program).run()` | Inline leaf handlers, business logic |
| `src/types/` | Global type declarations (e.g. `md.d.ts`) | Runtime logic |
| `src/program.ts` | `CliProgram` assembly: `docs`, `commands: […]` | Inline leaf handlers, business logic |
| `src/commands/<name>/` | One user-facing command: `command.ts` | Shared helpers unrelated to the command |
| `scripts/` | Dev tooling (formula helpers) | Production command paths |

When adding commands: `src/commands/<name>/command.ts`; register in `program.ts` **alphabetically by command key**.

**Argsbarg schema:** see Argsbarg schema section above.

### Execution

- **CLI:** `bun ./src/index.ts …` or `just run …`
- **Tests:** `just test` (after `just check`)

<!-- /argsbarg:managed -->

**full-example conventions:**

Replace with app-specific bullets.
