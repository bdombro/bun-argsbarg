# Configure command

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

**Uninstall the binary:** remove agent artifacts first (while the CLI is still on PATH), then `brew uninstall`:

```bash
<key> configure --remove-all --yes
brew uninstall <tap>/<key>
```

`brew uninstall` runs the formula `uninstall` hook, which removes app config (`configure --remove-config --yes`). Skills and MCP entries are not removed by Homebrew — use `--remove-all` before uninstall when you want those gone too.

## Developer install

```bash
just build
just install-local    # same formula as production; temporary file:// URL during brew install (`just install` is an alias)
```

Dev flow matches release: formula `install` copies the binary and generates completions; `post_install` runs `<key> configure --sync --yes` for skills/MCP. Use `just reinstall-local` to swap the binary into Cellar during tight edit cycles (skips completions and `post_install`). Use `just sync-artifacts` to refresh agent artifacts without touching the binary.

## Quick reference

```bash
# Refresh skills/MCP after upgrade (Homebrew post_install runs this automatically)
<key> configure --sync --yes

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
<key> configure set <key> <value> [--json]
```

Non-interactive / CI: pass **`--yes`** (or **`--json`**, **`--sync`**, **`--remove-all`**, **`--remove-config`**) — see [Confirmation](#confirmation).

## What gets configured

| Target | Interactive | Mechanism |
| --- | --- | --- |
| Binary | skipped (read-only) | Homebrew formula `bin.install` |
| Shell completions | skipped | Homebrew `generate_completions_from_executable` |
| Cursor skill | Y/n prompt | `~/.cursor/skills/<dir>/` when `~/.cursor` exists |
| Claude skill | Y/n prompt | `~/.claude/skills/<dir>/` when `~/.claude` exists |
| Codex / OpenCode / OpenClaw skills | Y/n prompt | Agent-specific dirs when available |
| MCP config | Y/n prompt when `mcpServer.enabled` | Cursor, Claude Code/Desktop, OpenCode, Codex, OpenClaw, ChatGPT desktop |
| App config | auto-runs wizard | Interactive wizard writes `~/.local/lib/<key>/config.json` (schema-aware: comma-separated or JSON for primitive arrays) |

### Externally managed binary (Homebrew)

When **`PATH`** resolves the program key to the **running executable** (e.g. after `brew install`):

- **`configure --status`** shows `app: system (PATH)`
- **`--sync`** refreshes skills and MCP only — not the binary or completions

MCP config uses the command name on **`PATH`**, not a Cellar path.

### Interactive default

Bare **`configure`** (TTY required) walks enabled install targets in order. For each target:

- **Not installed:** `[Y/n]` — default install; `n` skips.
- **Installed:** `[y/N]` — default keep; `n` uninstalls.
- **App config** (`program.appConfig` with entries): runs the config wizard automatically (no Y/n gate). Remove the config file with **`configure --remove-config --yes`**.

The **`app`** target (binary on PATH) is shown in `--status` only — never mutated by `configure`.

### `configure.targets`

Configure which artifacts participate in `--sync`:

```typescript
configure: {
  agentIntegration: "mcp", // | "skill" | "both" — default from mcpServer.enabled
  targets: {
    chatgptMcp: false,
    cursorSkill: { includedInAll: true },
  },
},
```

`ConfigureTargetSpec` is `boolean` or `{ enabled?: boolean; includedInAll?: boolean }`.

Artifact keys: `chatgptMcp`, `claudeCodeMcp`, `claudeDesktopMcp`, `claudeSkill`, `codexMcp`, `codexSkill`, `configure`, `cursorMcp`, `cursorSkill`, `openclawMcp`, `openclawSkill`, `opencodeMcp`, `opencodeSkill`.

## App config (`program.appConfig`)

When `program.appConfig` is set, ArgsBarg manages a flat JSON config file at `~/.local/lib/<sanitized-key>/config.json`.

| Mode | Description |
| --- | --- |
| Interactive `configure` | Config wizard when you accept the configure target |
| `--status` | Shows config path and which required keys are set or missing |
| `--remove-config --yes` | Removes the config directory |

Export helpers from `argsbarg`: `resolveAppConfigPath`, `displayAppConfigPath`.

## Flags

### Operation flags

| Flag | Description |
| --- | --- |
| `--status` | Read-only inventory |
| `--sync` | Refresh installed agent artifacts (Homebrew `post_install`; greenfield → full sync plan) |
| `--remove-all` | Remove all detected agent artifacts |
| `--remove-config` | Remove app config directory only |

### Behavior flags

| Flag | Description |
| --- | --- |
| `--yes`, `-y` | Skip confirmation (required for non-interactive modes) |
| `--dry` | Preview changes |
| `--json` | Machine-readable output (implies `--yes`) |

## Confirmation

Interactive `configure` prints a **`{app} Setup`** banner and per-target prompts. Non-interactive modes (`--sync`, `--remove-all`, `--remove-config`) require **`--yes`** unless `--dry`.

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
  system bin/"myapp", "configure", "--sync", "--yes"
end
```

This refreshes skills/MCP without running the configure wizard (app config is opt-in via interactive `configure`).

## Formula `uninstall`

Release formulae should run:

```ruby
def uninstall
  system bin/"myapp", "configure", "--remove-config", "--yes"
end
```

Homebrew calls this before removing the keg, so the binary is still on PATH. Safe no-op when app config was never created or `program.appConfig` is unset.

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
