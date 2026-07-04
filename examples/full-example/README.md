# full-example

**Full argsbarg reference app** — bootstrap new production CLIs with `bunx argsbarg create`.

## What this demonstrates

| Area | Files / wiring |
| --- | --- |
| All builtins | `completion`, `version`, `install`, `docs`, `mcp`, `config get`/`set` |
| `program.appConfig` | `src/types.ts` (`AppConfig`) → `schemas/configSchemas.ts` |
| `outputSchema` | `src/commands/status/types.ts` (`StatusJsonOutput`) → `schemas/outputSchemas.ts` |
| Schemagen | `scripts/schemagen.ts` + `scripts/schemagen/discover-schema-roots.ts` |
| Command layout | `src/commands/<name>/command.ts`; registration in `src/program.ts` |
| MCP doc topics | `docs.topics` auto-exposed as `<key>://docs/<topic>` resources when docs + MCP enabled |
| Package import | `from "argsbarg"` (not relative to argsbarg `src/`) |
| Homebrew distribution | `scripts/formula-shared.ts`, `scripts/gen-dev-formula.ts`, `Formula/`, `justfile` |
| Dev tooling | Biome (`just format` / `just lint`), TypeScript, colocated tests |
| Cursor rules | `.cursor/rules/cli-program.mdc`, `.cursor/rules/code.mdc` |

## Bootstrap a new CLI

Interactive (TTY):

```bash
bunx argsbarg create my-cli
```

Non-interactive:

```bash
bunx argsbarg create my-cli \
  --key my-cli --release-repo org/my-cli --yes
```

Edit `scripts/create-identity.ts` to set `desc` (used by `program.description` and the Homebrew formula).

`create` copies this template (including `.cursor/rules/cli-program.mdc`), substitutes identity placeholders, runs `bun install`, schemagen, `bun test`, and `git init` + Initial commit when appropriate.

**Git bootstrap:** skipped when `{target}/.git` already exists, or when the target is inside an existing git work tree (monorepo subfolder). Standalone new directories get `Initial commit`.

To refresh the Cursor rule in an existing consumer: `bun scripts/merge-cli-program-rule.ts .` from an argsbarg checkout (or pass the npm package path to the template).

## Quick start (in this repo)

```bash
cd examples/full-example
just setup
just schemagen   # after changing src/**/types.ts
FULL_EXAMPLE_API_TOKEN=dev just run status --json
FULL_EXAMPLE_API_TOKEN=dev just run config get apiToken --json
FULL_EXAMPLE_API_TOKEN=dev just run docs readme
```

## Homebrew dev install

Requires [Homebrew](https://brew.sh) and a compiled binary at `dist/full-example`:

```bash
just build
just install-local              # first-time dev formula (`just install` is an alias)
just reinstall-local            # fast binary swap during development
just install-production         # uninstall local dev, install from GitHub tap
just test-release
```

Undo a local dev install:

```bash
just uninstall          # dev formula + agent artifacts
just uninstall-config   # app config only
just uninstall-release  # release formula (keeps tap)
```

See [docs/distribution-homebrew.md](../../docs/distribution-homebrew.md).

## Schemagen markers

| Marker in interface JSDoc | Artifact |
| --- | --- |
| `Config schema` | `schemas/configSchemas.ts` + `schemas/generated/*-config.json` |
| `JSON payload` | `schemas/outputSchemas.ts` + `schemas/generated/*.json` |

Discovery walks `src/**/types.ts` only.

## Environment

| Variable | Purpose |
| --- | --- |
| `FULL_EXAMPLE_API_TOKEN` | Overrides `apiToken` via `program.appConfig` env mapping |

## Maintainers (argsbarg repo)

When adding or changing builtins, update this example and run:

```bash
just check-full-example   # from argsbarg repo root
just test                 # from examples/full-example
```
