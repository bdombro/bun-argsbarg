# Configure command

> This feature is experimental.

The `configure` built-in manages **agent artifacts** (skills, MCP config, app config). The **binary and shell completions** ship via Homebrew — see [distribution-homebrew.md](distribution-homebrew.md).

Opt out with `configure: { enabled: false }` on the program root.

## End-user install (Homebrew)

Private GitHub release downloads require [GitHub CLI](https://cli.github.com/) authentication for `brew install` and `brew upgrade`. See [distribution-homebrew.md](distribution-homebrew.md#end-user-install) (`brew install gh`, then `gh auth login`).

```bash
brew tap <org>/<repo> git@github.com:<org>/<repo>.git
brew install <tap>/<key>
<key> configure    # interactive: per-target prompts; run when app config is required
```

Upgrade with `brew upgrade <key>`. Shell completions are installed by Homebrew during `brew install`. Users must configure their shell per [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

**Uninstall the binary:**

```bash
brew uninstall <tap>/<key>
```

`brew uninstall` runs the formula `uninstall` hook (`configure --remove-all --yes`), which removes detected skills, MCP entries, and app config while the binary is still on PATH.

To remove app config only (keep skills/MCP), run `configure --remove-config --yes` before uninstall.

## Developer install

```bash
just build
just install-local    # uninstall, then build + brew install (`just install` is an alias)
```

Dev flow matches release: `install-local` runs `uninstall` first (keg + untap; formula hook runs `configure --remove-all`), then stages the dev formula and installs. `post_install` runs `<key> configure --refresh --yes` for skills/MCP. Use `just reinstall-local` to swap the binary into Cellar during tight edit cycles (skips completions and `post_install`). Run `<key> configure --refresh --yes` (or `just run configure --refresh --yes`) to refresh agent artifacts without touching the binary.

## Quick reference

```bash
# Refresh skills/MCP after upgrade (Homebrew post_install runs this automatically)
<key> configure --refresh --yes

# See what is installed
<key> configure --status

# Interactive per-target setup (default when run with a TTY)
<key> configure

# Remove all agent artifacts
<key> configure --remove-all --yes

# Remove app config only (not skills/MCP)
<key> configure --remove-config --yes

# Read or write app config (non-interactive; when program.appConfig is set)
<key> configure get [key] [--json] [--pretty]
<key> configure set <key> <value> [--json] [--from-env]
```

Non-interactive / CI: pass **`--yes`** (or **`--json`**, **`--refresh`**, **`--remove-all`**, **`--remove-config`**) — see [Confirmation](#confirmation).

## What gets configured

| Target | Interactive | Mechanism |
| --- | --- | --- |
| Binary | skipped (read-only) | Homebrew formula `bin.install` |
| Shell completions | skipped | Homebrew `generate_completions_from_executable` |
| Agent skill | skipped (automatic) | `~/.agents/skills/<key>/` when `program.skill.enabled` |
| MCP config | skipped (automatic) | `~/.agents/mcp.json` when `mcpServer.enabled` (see https://dotagentsprotocol.com) |
| App config | auto-runs wizard | Interactive wizard may update `~/.local/lib/<key>/config.json` when values change; `--refresh` bootstraps an empty file on install |

### Externally managed binary (Homebrew)

When **`PATH`** resolves the program key to the **running executable** (e.g. after `brew install`):

- **`configure --status`** shows `app: system (PATH)`
- **`configure --refresh`** refreshes the agent skill (when `program.skill.enabled`) and merges MCP into `~/.agents/mcp.json` (when `mcpServer.enabled`); also creates `~/.local/lib/<key>/config.json` as `{}` when missing (all apps)

MCP config uses the command name on **`PATH`**, not a Cellar path. For Cursor, Claude Code, and Claude Desktop, copy the `mcpServers` entry manually — see [mcp.md](mcp.md) and `docs mcp`.

### Interactive default

Bare **`configure`** (TTY required) runs the app config wizard when `program.appConfig` has entries. Agent skills and MCP are **not** prompted — they install automatically via brew `post_install` / `--refresh` when `program.skill.enabled` or `mcpServer.enabled` respectively.

Remove the config file with **`configure --remove-config --yes`**.

The **`app`** and **`skill`** / **`agentsMcp`** targets are shown in `--status` only — never mutated by interactive `configure` (use `--refresh` / brew hooks).

### `configure.targets`

Optional gates for app binary status and app-config wizard participation in `--refresh`:

```typescript
skill: { enabled: true },
mcpServer: { enabled: true },
configure: {
  targets: {
    configure: { includedInAll: true }, // optional: app config wizard on --refresh
  },
},
```

`ConfigureTargetSpec` is `boolean` or `{ enabled?: boolean; includedInAll?: boolean }`.

Artifact keys: `app`, `configure`. Legacy `configure.targets.*Mcp` keys are rejected — MCP installs to `~/.agents/mcp.json` when `mcpServer.enabled`.

### Lifecycle hooks

Optional callbacks on `program.configure` for app-specific agent setup beyond the `.agents` protocol (e.g. Cursor or Claude Desktop config). Framework artifacts are installed/refreshed first; hooks extend or retract custom files.

```typescript
configure: {
  afterRefresh: async (ctx) => {
    if (ctx.dry) return;
    // e.g. symlink skill, merge Cursor mcp.json — ctx.paths has agentsSkillDir, agentsMcpPath, mcpName
  },
  beforeRemoveAll: async (ctx) => {
    if (ctx.dry) return;
    // undo custom installs before framework removes ~/.agents/ artifacts
  },
},
```

| Hook | When |
| --- | --- |
| `afterRefresh` | After `configure --refresh` installs framework artifacts |
| `beforeRemoveAll` | Before `configure --remove-all` removes framework artifacts (not `--remove-config`) |

## App config (`program.appConfig`)

Every app gets `~/.local/lib/<sanitized-key>/config.json` on first **`configure --refresh`** (Homebrew `post_install`), even without `program.appConfig`.

When `program.appConfig` is set, ArgsBarg manages schema-driven values in that file.

| Mode | Description |
| --- | --- |
| `configure --refresh` | Bootstraps `config.json` as `{}` when missing |
| Interactive `configure` | Config wizard when `entries` is non-empty; re-prompts every entry (Enter keeps current); writes only when values or `_bindings` change |
| `--status` | Shows config path, required keys (`set` / `missing`), and binding hints (`env`, `file`, `skip`) |
| `--remove-config --yes` | Removes the config directory |
| `configure set --from-env` | Bind a key to its mapped env var (stores `_bindings`, no literal secret) |

Per-key intent is stored under the reserved `_bindings` object (e.g. `"apiToken": "env"`). Env still wins at resolve time when set; bindings record user choice. CLI startup only prompts for missing required keys; interactive `configure` re-prompts all entries.

Export helpers from `argsbarg`: `resolveAppConfigPath`, `displayAppConfigPath`.

## Flags

### Operation flags

| Flag | Description |
| --- | --- |
| `--status` | Read-only inventory |
| `--refresh` | Refresh installed agent artifacts; bootstrap `config.json` when missing (Homebrew `post_install`; greenfield → full install plan) |
| `--remove-all` | Remove all detected agent artifacts |
| `--remove-config` | Remove app config directory only |

### Behavior flags

| Flag | Description |
| --- | --- |
| `--yes`, `-y` | Skip confirmation (required for non-interactive modes) |
| `--dry` | Preview changes |
| `--json` | Machine-readable output (implies `--yes`) |

## Confirmation

Interactive `configure` prints a **`{app} Setup`** banner and per-target prompts. Non-interactive modes (`--refresh`, `--remove-all`, `--remove-config`) require **`--yes`** unless `--dry`.

## MCP merge behavior

When MCP targets are installed, entries are merged into host config with:

```json
{ "command": "<root.key>", "args": ["mcp"] }
```

If an existing entry differs, the command exits with an error unless `--yes` is passed.

## Formula `post_install`

Release formulae should run:

```ruby
def post_install
  system bin/"myapp", "configure", "--refresh", "--yes"
end
```

This refreshes skills/MCP without running the configure wizard (app config is opt-in via interactive `configure`).

## Formula `uninstall`

Release formulae should run:

```ruby
def uninstall
  system bin/"myapp", "configure", "--remove-all", "--yes"
end
```

Removes detected skills, MCP entries, and app config while the binary is still on PATH. Safe no-op when nothing was installed.

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
