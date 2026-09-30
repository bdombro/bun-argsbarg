# Config schema (`appConfig`)

How to declare app configuration: a flat JSON file, env overrides, handler access via `ctx.appConfig`, and an optional Zod schema for typed config.

## Argsbarg contract

On the **app root**, set `appConfig` with metadata `entries` and an optional Zod object `schema`:

```typescript
import { argsbarg } from "argsbarg";
import { Settings } from "./config/types.ts";

const app = argsbarg({
  key: "myapp",
  version: "1.0.0",
  description: "…",
  appConfig: {
    schema: Settings,
    entries: {
      apiToken: {
        description: "Create at https://example.com/settings/tokens",
        env: "API_TOKEN",
        sensitive: true,
      },
      defaultRegion: { description: "AWS region.", required: false },
      maxRetries: { description: "Retry count." },
    },
  },
  handler: (ctx) => {
    const token = ctx.appConfig.require("apiToken");
    const region = ctx.appConfig.get("defaultRegion"); // default already applied
  },
});

await app.run();
```

| Where argsbarg uses it | Purpose |
| --- | --- |
| Config file | Flat JSON keyed by schema names; strict load (unknown keys rejected) |
| Interactive `configure` / `--status` | Auto-runs config wizard when `entries` is non-empty; `--status` for read-only inventory |
| Built-in `configure get` / `configure set` | Read/write resolved values (opt-out via `commands: false`) |
| MCP bundle / Claude plugin | `userConfig` for entries with `env` set |
| `ctx.appConfig` in handlers | `get`, `require`, `set`, `read`, `getUnsafe`, `setUnsafe`, `readUnsafe`, `path`, `dir` — prefer `get`/`set` when `appConfig` is set |

**Handler access** — with `appConfig`: `get` / `set` / `require` use schema validation and resolved values. `getUnsafe` / `setUnsafe` / `readUnsafe` read and write the raw file (for `_bindings` and ad-hoc keys). Without `appConfig`, only `path`, `dir`, and the `*Unsafe` methods work.

**`_bindings`** — reserved top-level metadata: `{ "_bindings": { "apiToken": "env" } }`. Set via wizard (Enter to use env), `configure set --from-env`, or `ctx.appConfig.set` (marks `file`). Optional keys can be bound to `skip`.

**Validation at runtime:** argsbarg validates the config file and `configure set` / `ctx.appConfig.set` against the effective Zod schema ([schemas](json-schema-subset.md)). Partial writes (bindings only, single-key updates) validate with `schema.partial()`, so top-level required keys are skipped.

See [cli-program.md — Configuration](cli-program.md#configuration-programappconfig) for resolution order, bootstrap timing, and `configure get`/`set`.

## `AppConfig` and `AppConfigEntry`

```typescript
export interface AppConfigEntry {
  description: string;
  title?: string;       // default: config key
  default?: string;     // all-string mode only
  required?: boolean;   // default: true (can override schema required)
  sensitive?: boolean;  // default: name heuristic
  env?: string;         // env override + export to process.env after resolve
  resolve?: AppConfigResolveFn;  // fallback after file; must be synchronous
}

export interface AppConfig {
  commands?: boolean | { enabled?: boolean; mcpSet?: boolean };
  schema?: z.ZodObject;  // Zod object schema (z.strictObject recommended); omit for all-string mode
  entries: Record<string, AppConfigEntry>;
}
```

**Conventions:**

- Secrets: `env: "API_TOKEN"` on entry; file key `apiToken`
- Prefs without env: local-file only; excluded from MCP/plugin manifests
- MCP manifests: only entries with `env` set (sanitized to snake_case keys)

## Config file shape

Flat JSON at `~/.local/lib/<sanitized-key>/config`:

```json
{
  "apiToken": "xxx",
  "defaultRegion": "eu-west-1",
  "maxRetries": 5,
  "prefs": { "ttl": 3600 }
}
```

No nested `env` bag. No extra keys — rejected on load.

## Resolution order (per schema key)

| Step | Source | Notes |
| --- | --- | --- |
| 1 | **Env** (`entry.env`) | Non-empty host env wins over file and `resolve` |
| 2 | **File** | `config.json` value for the key |
| 3 | **`resolve()`** | Optional synchronous callback (e.g. `gh auth token`); return `undefined` to continue. Async/Promise return values are ignored. |
| 4 | **Env** (`entry.env`) | Fallback when `resolve` returned `undefined` |
| 5 | **Default** | `schema` field `.default()` / `entry.default` |

Empty string in env or file counts as **missing** for required entries. After resolution, mapped values are exported to `process.env`.

Example — GitHub token with `env: "GH_TOKEN"` and `resolve` calling `gh auth token`:

```typescript
githubToken: {
  description: "GitHub API token.",
  env: "GH_TOKEN",
  sensitive: true,
  resolve: () => {
    try {
      const r = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe", stderr: "ignore" });
      if (r.exitCode === 0) {
        const token = new TextDecoder().decode(r.stdout).trim();
        return token.length > 0 ? token : undefined;
      }
    } catch {
      // `gh` not installed
    }
    return undefined;
  },
},
```

Interactive `configure` does not persist values supplied only by env or `resolve` when you press Enter to accept the current value.

## All-string vs typed config

| Approach | When |
| --- | --- |
| **Omit `schema`** | Simple apps; all values are strings; use `entry.default` |
| **Zod `schema`** | Typed config, nested objects, defaults, formats |

## Typed config with Zod

Define the config schema next to the program, with `.describe()` on every key (agents and prompts read it):

```typescript
// src/config/types.ts
import { z } from "zod";

/** App configuration file. Named `Settings` so it doesn't clash with argsbarg's `AppConfig` type. */
export const Settings = z.strictObject({
  apiToken: z.string().min(1).describe("Create at https://example.com/settings/tokens"),
  defaultRegion: z.string().default("us-east-1").describe("AWS region."),
  maxRetries: z.number().int().min(0).max(10).default(3).describe("Retry count."),
});

/** Parsed app configuration. */
export type Settings = z.infer<typeof Settings>;
```

Wire it on the app root with `appConfig: { schema: Settings, entries: { … } }`. Every `entries` key must exist in `schema.shape`, and argsbarg checks this at startup. `z.strictObject` rejects unknown keys on load. With `z.object`, unknown keys are stripped, and MCP/HTTP startup logs a `schema.strictness` warning.

Prompts, `configure set` coercion, and MCP manifests read the emitted JSON Schema (`z.toJSONSchema(schema, { io: "input" })`), so `.default()` values show up as defaults and fields with defaults become optional.

## Minimal example (all-string mode)

```typescript
appConfig: {
  entries: {
    apiToken: { description: "Token.", env: "API_TOKEN", sensitive: true },
    greeting: { description: "Greeting.", default: "hello", required: false },
  },
},
```

All file values are strings. Defaults come from `entry.default`.

## Built-in `configure get` / `configure set`

When `appConfig` is set and `commands !== false`:

| Subcommand | Purpose |
| --- | --- |
| `configure get [key]` | Resolved value(s); `--json`; `--json --pretty` |
| `configure set <key> <value>` | One key; full document re-validated after merge |

`configure get`/`set` skip required-config exit and TTY prompts. Sensitive values redact on `get` (`REDACTED` / `{ "set": true }` with `--json`).

Object/array/`$ref` properties require `--json` on `configure set` when comma-separated or JSON-literal input does not apply (e.g. objects, arrays of objects). Homogeneous primitive arrays (`string[]`, `number[]`, `integer[]`, `boolean[]`, and `string[]` with `format: date` / `date-time` on items) accept comma-separated values or a JSON array in both `configure set` and interactive `configure`.

## Example in this repo

| Example | Role |
| --- | --- |
| [`examples/api/`](../examples/api/) | **Schema-first copy template**: Zod schemas, builtins; optional `appConfig` |

```bash
cd examples/api && just setup
EXAMPLE_API_API_TOKEN=dev just run configure get apiToken --json
```
