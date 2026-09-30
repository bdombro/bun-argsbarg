```
                          ___.                        
_____ _______  ____  _____\_ |__ _____ _______  ____  
\__  \\_  __ \/ ___\/  ___/| __ \\__  \\_  __ \/ ___\ 
 / __ \|  | \/ /_/  >___ \ | \_\ \/ __ \|  | \/ /_/  >
(____  /__|  \___  /____  >|___  (____  /__|  \___  / 
     \/     /_____/     \/     \/     \/     /_____/  
```
<!-- src https://patorjk.com/software/taag/#p=display&f=Graffiti&t=argsbarg&x=none&v=4&h=4&w=80&we=false -->

[GitHub](https://github.com/bdombro/bun-argsbarg) · [npm](https://www.npmjs.com/package/argsbarg) · [License: MIT](LICENSE)

Build well-behaved CLIs, HTTP REST services, and MCP servers from one schema. Runs on Node ≥ 20 (Bun runs the same build). No production dependencies; one peer: [Zod](https://zod.dev).

- **Schema-first** — declare commands, options, positionals, and Zod input/output schemas once; argsbarg parses, validates, types `ctx.inputs`, and routes.
- **Zod schemas** — validated with Zod and emitted as JSON Schema for MCP, OpenAPI, and help. No codegen step.
- **HTTP REST server** — commands become routes, with `/health/liveness`, `/health/readiness`, `/openapi.json`, `/swagger`, and ECS JSON logs on stderr.
- **MCP server** — every command becomes a stdio MCP tool; package it as a Claude Code / Cursor plugin or `.mcpb` bundle.
- **Plain-text help** — scoped `-h` at any depth, no color or boxes; when piped, help includes the input and output schemas for agents.
- **Shell completions** — `completion bash|zsh|fish`.

Also check out ArgsBarg for [cpp](https://github.com/bdombro/cpp-argsbarg), [nim](https://github.com/bdombro/nim-argsbarg), and [swift](https://github.com/bdombro/swift-argsbarg).

```text
$ nested.ts --help
Nested groups demo.

── Usage ───────────────────────────────────────────────────────────────────────
  nested.ts [OPTIONS] COMMAND [ARGS]...

── Options ─────────────────────────────────────────────────────────────────────
  --help, -h  Show help for this command.

── Commands ────────────────────────────────────────────────────────────────────
  mcp      MCP server and bundle tools.
  read     Print the first line of each file.
  stat     File metadata.
  version  Print the program version.
```

## Getting started

Scaffold a project (TypeScript, Biome, `node:test`, just, and a gated release script):

```bash
npx argsbarg@latest create my-app          # interactive: pick a template, key, release repo
npx argsbarg@latest create my-app --template api --key my-app --release-repo org/my-app --yes
```

Or add it to an existing app: `npm install argsbarg zod`.

```typescript
import { argsbarg, command, OptionKind } from "argsbarg";

const app = argsbarg({
  commands: [
    command({
      key: "greet",
      description: "Greet someone by name.",
      options: [{ name: "loud", description: "Shout the greeting.", kind: OptionKind.Presence }],
      positionals: [{ name: "name", description: "Who to greet.", kind: OptionKind.String, argMin: 0 }],
      handler: (ctx) => {
        const greeting = `hello ${ctx.inputs.name ?? "world"}`;
        console.log(ctx.inputs.loud ? greeting.toUpperCase() : greeting);
      },
    }),
  ],
  description: "Tiny demo.",
  httpServer: { enabled: true },
  key: "helloapp",
  mcpServer: { enabled: true },
  version: "1.0.0",
});

await app.run();
```

`app.run()` parses `process.argv`, prints help or errors, runs the handler, and exits: **0** on success or explicit `--help`, **1** on errors or implicit help. `app.invoke(argv)` runs a command without exiting (tests, HTTP, MCP).

## Templates

`argsbarg create` copies a template, fills in the key, release repo, and description (`src/create-identity.ts`), installs dependencies, runs `just test`, and makes an initial commit when the target isn't already in a git work tree. Check an existing tree with `npx argsbarg create --check .`.

| Template | Distribution | Shows |
| --- | --- | --- |
| **cli** (default) | npm / `npx` | All built-ins; options and flags only |
| **api** | npm / `npx` | Zod `inputSchema`/`outputSchema`, REST CRUD, `node:sqlite` |
| **agent-plugin** | Claude Code / Cursor plugin | A committed single-file Node bundle (esbuild) |
| **homebrew** | Homebrew tap | A Bun-compiled binary and formula ([guide](examples/homebrew/docs/distribution.md)) |

Every template ships `AGENTS.md` (argsbarg authoring rules for agents), `CLAUDE.md`, and `skills/<key>/SKILL.md`. Templates and small demos (`examples/minimal.ts`, `nested.ts`, `formats.ts`, `servers.ts`) ship in the package under `node_modules/argsbarg/examples/`.

## Concepts

- **Tree** — the app root and **command groups** have `commands`; **commands** have a `handler`. A group may set `fallbackCommand` / `fallbackMode` for default routing. Build every command with `command({ … })` so `ctx.inputs`, `ctx.pathParams`, and return values are typed.
- **Options** — POSIX style (`-v`, `--name value`, `--name=value`, bundled `-abc`, `--` separator); kinds `Presence`, `String`, `Number`, `Enum`, `Json`; string `format`s `duration`, `comma-list`, `date`, `date-time`.
- **Positionals** — `argMin` / `argMax` (`argMax: 0` is an unbounded tail).
- **Reading values** — `ctx.inputs` (coerced and, with `inputSchema`, Zod-parsed), plus `ctx.hasFlag`, `ctx.stringOpt`, `ctx.durationOpt`, `ctx.positional`, `ctx.args`, `ctx.invocation` (`cli` / `http` / `mcp`).
- **Errors** — `cliErrWithHelp(ctx, msg)` prints the message and scoped help and exits 1 on the CLI; on HTTP/MCP it throws.
- **Hooks** — `hooks.beforeInvoke`, `afterInvoke`, `formatError`, and `onError` run around user commands on every surface.

### Fallback modes (`FallbackMode`)

| Mode | Empty argv | Unknown first token |
| --- | --- | --- |
| `MissingOnly` | Default command | Error |
| `MissingOrUnknown` | Default command | Default command (token becomes its argv) |
| `UnknownOnly` | Help (exit 1) | Default command |

### Built-ins

Injected at runtime, not declared in your tree. Don't declare root commands with these names:

| Command | When |
| --- | --- |
| `version` | Always |
| `completion bash\|zsh\|fish` | Always (disable with `completion: { enabled: false }`) |
| `http` | `httpServer.enabled: true` — see [http-server.md](docs/http-server.md) |
| `mcp`, `mcp bundle` | `mcpServer.enabled: true` — see [mcp.md](docs/mcp.md) |

## Documentation

The guides ship in the package under `node_modules/argsbarg/docs/`.

| If you are… | Read |
| --- | --- |
| **Authoring an app** (humans or agents) | [cli-program.md](docs/cli-program.md) — the authoritative guide: commands, options, formats, hooks, headless handlers |
| **Writing schemas** | [schemas.md](docs/schemas.md) — Zod 4 `inputSchema` / `outputSchema`, JSON stdout |
| **Exposing MCP tools** | [mcp.md](docs/mcp.md) — stdio server, tool schemas, plugins and bundles, client setup |
| **Running the HTTP server** | [http-server.md](docs/http-server.md) — routes, endpoints, responses |
| **Server logging** | [logging.md](docs/logging.md) — ECS JSON lines, `enrich`, `serialize`, trace headers |
| **Maintaining argsbarg** | [developing.md](docs/developing.md) — tooling, release, upgrade notes |
| **Why things are the way they are** | [decisions.md](docs/decisions.md) — design decisions and why |

## License

MIT
