# example-cli

Argsbarg npm/npx CLI: all builtins, options and flags only (no schemas). Users run it with `npx example-cli` or `npm install -g example-cli` (`bin` → `dist/index.js`).

## Argsbarg authoring

When adding or changing commands, schemas, or MCP exposure:

1. **Read** `node_modules/argsbarg/docs/cli-program.md` first (authoritative).
2. MCP tools, varargs, `inputSchema` → `node_modules/argsbarg/docs/mcp.md`.
3. Zod schemas (`inputSchema`, `outputSchema`, JSON stdout) → `node_modules/argsbarg/docs/schemas.md`.
4. Other templates for reference: `node_modules/argsbarg/examples/` (`cli`, `api`, `agent-plugin`, `homebrew`).

**Rules** (details are in the docs above; don't contradict them):

- Reserved root commands: `completion`, `mcp`, `http`, `version`.
- `argsbarg({ … })` builds the app in `src/app.ts`; `command({ … })` declares every command (typed `ctx.inputs` / `ctx.pathParams`). Give the root, commands, options, and positionals action-oriented `description`s.
- Omit `mcpTool` unless a command is genuinely CLI-only (`enabled: false`) or hits an irreducible wire limit; fix the schema and headless path first.
- Interactive commands have one headless path shared by MCP, non-TTY CLI, and `--yes` / `--dry-run` / `--json` (`shouldRunHeadless*`, `requireYesInNonTty`); don't branch on raw `isTTY`.
- String options: `format` / `default` / `pattern` per `cli-program.md`.
- Varargs (`argMax: 0`): space-separated on the CLI, a JSON array over MCP; never comma-split positionals.
- App settings are app code (env vars or your own file); argsbarg doesn't manage them.

## Code conventions

- **JSDoc:** document exported surfaces that aren't obvious from the name (output schemas, public types, non-trivial algorithms). Skip short test callbacks and pure re-export files.
- **Names:** describe the domain role; avoid `data` / `handler`-style placeholders outside tiny scopes.
- **Structure:** after imports, exported symbols first (alphabetical within each kind), then module-private helpers. Relative imports with explicit `.ts` extensions.
- **Abstractions:** keep single-use helpers in the calling file. Split only when reused, when the caller is hard to follow, or when the extraction is a substantial unit.
- **Skill:** when commands are added, renamed, or removed, update `skills/example-cli/SKILL.md`.

### Module boundaries

| Path | Owns | Must not |
| --- | --- | --- |
| `src/index.ts` | Entry: `await app.run()` | Command handlers, business logic |
| `src/app.ts` | App spec: `commands: […]` (alphabetical by key) | Command handlers, business logic |
| `src/create-identity.ts` | Key, release repo, description (rewritten by `argsbarg create`) | Anything else |
| `src/commands/<name>/` | One command: `command.ts`, colocated `*.test.ts` | Shared helpers (lift them out) |
| `scripts/` | Dev tooling (release) | Production command paths |

## Tooling

- Node ≥ 22.18 and npm; no Bun required. [just](https://just.systems) runs the tasks.
- `just setup`, `just check` (Biome + `tsc --noEmit`), `just test` (check + `node --test`), `just build` (`tsc` → `dist/`), `just run …` (from source, type-stripped).
- Release: `just release <major|minor|patch>` → `npm publish` (asks first; `--dry-run` changes nothing).

## Documentation

- `README.md` — install and commands for users
- `docs/architecture.md` — maintainer notes (create when needed)
- `skills/example-cli/SKILL.md` — agent skill (customize as needed)

## App conventions

Replace with app-specific bullets.
