# Configure command

> This feature is experimental.

The `configure` built-in manages **agent artifacts** (skills, MCP config, app config). The **binary and shell completions** ship via Homebrew — see [distribution-homebrew.md](distribution-homebrew.md).

Opt out with `configure: { enabled: false }` on the program root.

## End-user install (Homebrew)

Private GitHub release downloads require [GitHub CLI](https://cli.github.com/) authentication for `brew install` and `brew upgrade`. See [distribution-homebrew.md](distribution-homebrew.md#end-user-install) (`brew install gh`, then `gh auth login`).

```bash
brew tap <org>/<repo> git@github.com:<org>/<repo>.git
brew install <tap>/<key>
<key> configure install   # skills, MCP, config bootstrap; required-config wizard on TTY
```

Upgrade with `brew upgrade <key>`, then run `<key> configure install` again. Shell completions are installed by Homebrew during `brew install`. Users must configure their shell per [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

**Uninstall:**

```bash
<key> configure uninstall
brew uninstall <tap>/<key>
```

Run `configure uninstall` **before** `brew uninstall` while the binary is still on PATH. Homebrew does not run cleanup hooks for agent artifacts in `~/.agents`.

## Developer install

```bash
just build
just install-local    # uninstall, build, brew install, configure install (`just install` is an alias)
```

`just install-local` runs `configure uninstall` (via `just uninstall`), installs via Homebrew, then `configure install`. Use `just reinstall-local` to swap the binary into Cellar during tight edit cycles; run `just refresh` afterward for skills/MCP.

## Quick reference

```bash
# Install skills/MCP after install or upgrade (required — not run by Homebrew)
<key> configure install

# See what is installed
<key> configure status [--json]

# Remove all agent artifacts and app config (run before brew uninstall)
<key> configure uninstall [--yes]

# Read or write app config (when program.appConfig is set)
<key> configure get [key] [--json] [--pretty]
<key> configure set <key> <value> [--json] [--from-env]
```

Bare `<key> configure` (no subcommand) shows help. Use subcommands above.

## What gets configured

| Target | `configure install` | Mechanism |
| --- | --- | --- |
| Binary | skipped (read-only) | Homebrew formula `bin.install` |
| Shell completions | skipped | Homebrew `generate_completions_from_executable` |
| Agent skill | automatic | `~/.agents/skills/<key>/` when `program.skill.enabled` |
| MCP config | automatic | `~/.agents/mcp.json` when `mcpServer.enabled` (see https://dotagentsprotocol.com) |
| App config | bootstrap + wizard | Creates `~/.local/lib/<key>/config.json` as `{}` when missing; TTY wizard when required keys are missing |

### Externally managed binary (Homebrew)

When **`PATH`** resolves the program key to the **running executable** (e.g. after `brew install`):

- **`configure status`** shows `app: system (PATH)`
- **`configure install`** refreshes the agent skill (when `program.skill.enabled`) and registers MCP in `~/.agents/mcp.json` (when `mcpServer.enabled`); bootstraps `config.json` when missing

MCP config uses the command name on **`PATH`**, not a Cellar path. For Cursor, Claude Code, and Claude Desktop, copy the `mcpServers` entry manually — see [mcp.md](mcp.md) and `docs mcp`.

### Required-config wizard

On **`configure install`**, when `program.appConfig` has entries and required keys are still missing after env resolution:

- **TTY:** runs the config wizard (required keys only; Enter keeps current values)
- **Non-TTY:** exits with an error listing missing keys

Optional keys are set via `configure set` or environment variables.

### `configure.targets`

Optional gates for app binary status:

```typescript
skill: { enabled: true },
mcpServer: { enabled: true },
configure: {
  targets: {
    configure: { includedInAll: true },
  },
},
```

`ConfigureTargetSpec` is `boolean` or `{ enabled?: boolean; includedInAll?: boolean }`.

Artifact keys: `app`, `configure`. Legacy `configure.targets.*Mcp` keys are rejected — MCP installs to `~/.agents/mcp.json` when `mcpServer.enabled`.

### Lifecycle hooks

Optional callbacks on `program.configure` for app-specific agent setup beyond the `.agents` protocol (e.g. Cursor or Claude Desktop config).

```typescript
configure: {
  afterInstall: async (ctx) => {
    // e.g. symlink skill, merge Cursor mcp.json — ctx.paths has agentsSkillDir, agentsMcpPath, mcpName
  },
  beforeUninstall: async (ctx) => {
    // undo custom installs before framework removes ~/.agents/ artifacts
  },
},
```

| Hook | When |
| --- | --- |
| `afterInstall` | After `configure install` installs framework artifacts |
| `beforeUninstall` | Before `configure uninstall` removes framework artifacts |

## App config (`program.appConfig`)

Every app gets `~/.local/lib/<sanitized-key>/config.json` on first **`configure install`**, even without `program.appConfig`.

When `program.appConfig` is set, ArgsBarg manages schema-driven values in that file.

| Mode | Description |
| --- | --- |
| `configure install` | Bootstraps `config.json` as `{}` when missing; wizard for missing required keys on TTY |
| `configure status` | Shows config path, required keys (`set` / `missing`), and binding hints (`env`, `file`, `skip`) |
| `configure uninstall` | Removes the config directory |
| `configure set --from-env` | Bind a key to its mapped env var (stores `_bindings`, no literal secret) |

Per-key intent is stored under the reserved `_bindings` object (e.g. `"apiToken": "env"`). Env still wins at resolve time when set; bindings record user choice.

Export helpers from `argsbarg`: `resolveAppConfigPath`, `displayAppConfigPath`.

## Subcommands

| Subcommand | Description |
| --- | --- |
| `install` | Install agent artifacts; bootstrap config; required-config wizard on TTY |
| `uninstall` | Remove skill, MCP entry, and app config (`--yes` skips TTY confirm) |
| `status` | Read-only inventory (`--json` for machine output) |
| `get` / `set` | Read or write `program.appConfig` keys (when configured) |

## MCP merge behavior

When MCP is enabled, `configure install` writes:

```json
{ "command": "<root.key>", "args": ["mcp"] }
```

If an existing entry matches, install is a no-op. If an existing entry differs, install skips and prints a warning (existing entry is left unchanged).

## Formula `caveats`

Generated formulae document the two-step install when the app has skills, MCP, or `appConfig` entries. Homebrew prints `caveats` after `brew install` and in `brew info`:

```ruby
def caveats
  <<~EOS
    After install or upgrade:
      myapp configure install

    Before uninstall:
      myapp configure uninstall
      brew uninstall <tap>/myapp
  EOS
end
```

Do **not** use `post_install` or `def uninstall` for agent artifacts — Homebrew sandboxes `post_install` and does not invoke formula `uninstall` hooks.

## Bootstrapping a new CLI

```bash
bunx argsbarg create my-cli --key my-cli --class-name MyCli --tap org/repo --yes
bunx argsbarg create --check .
```

See [distribution-homebrew.md](distribution-homebrew.md) and [../examples/full-example/README.md](../examples/full-example/README.md).

## Opt out

```typescript
configure: { enabled: false },
```

## Completion

The `completion` built-in remains callable for Homebrew `generate_completions_from_executable` but is **hidden** from help and exported schema.
