# consumer-app

**Kitchen-sink argsbarg reference** — copy this layout when bootstrapping a production CLI. For a minimal `program.appConfig` intro, see [`../config-app/`](../config-app/).

## What this demonstrates

| Area | Files / wiring |
| --- | --- |
| All builtins | `completion`, `version`, `install` (+ `--update`), `docs`, `mcp`, `config get`/`set` |
| `program.appConfig` | `src/types.ts` (`AppConfig`) → `schemas/configSchemas.ts` |
| `outputSchema` | `src/commands/status/types.ts` (`StatusJsonOutput`) → `schemas/outputSchemas.ts` |
| Schemagen | `scripts/schemagen.ts` + `scripts/schemagen/discover-schema-roots.ts` |
| Handler access | `ctx.appConfig` in `src/program.ts` |
| MCP doc topics | `docs.topics` auto-exposed as `<key>://docs/<topic>` resources when docs + MCP enabled |
| Package import | `from "argsbarg"` (not relative to argsbarg `src/`) |

## Quick start (in this repo)

```bash
cd examples/consumer-app
bun install
bun run schemagen   # after changing src/**/types.ts
CONSUMER_APP_API_TOKEN=dev bun run start status --json
CONSUMER_APP_API_TOKEN=dev bun run start config get apiToken --json
CONSUMER_APP_API_TOKEN=dev bun run start docs readme
```

## Copy into a new app

1. Copy this directory into your repo (e.g. `apps/my-cli/`).
2. Set `"argsbarg": "^<version>"` in `package.json` (replace `file:../..`).
3. Run `bun run schemagen` and commit `schemas/generated/` + bridge `.ts` files.
4. Copy [`node_modules/argsbarg/docs/templates/cursor/rules/cli-program.mdc`](../../docs/templates/cursor/rules/cli-program.mdc) to `.cursor/rules/`.

## Schemagen markers

| Marker in interface JSDoc | Artifact |
| --- | --- |
| `Config schema` | `schemas/configSchemas.ts` + `schemas/generated/*-config.json` |
| `JSON payload` | `schemas/outputSchemas.ts` + `schemas/generated/*.json` |

Discovery walks `src/**/types.ts` only.

## Environment

| Variable | Purpose |
| --- | --- |
| `CONSUMER_APP_API_TOKEN` | Overrides `apiToken` via `program.appConfig` env mapping |

## Maintainers (argsbarg repo)

When adding or changing builtins, update this example and run:

```bash
just consumer-app-schemagen
```
