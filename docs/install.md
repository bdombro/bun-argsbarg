# Install command

The `install` built-in manages **agent artifacts** (skills, MCP config, app config). The **binary and shell completions** ship via Homebrew — see [distribution-homebrew.md](distribution-homebrew.md).

Opt out with `install: { enabled: false }` on the program root.

## End-user install (Homebrew)

```bash
brew tap <org>/<repo>
brew install <tap>/<key>
<key> install --configure    # when app config is required (interactive)
```

Upgrade with `brew upgrade <key>`. Shell completions are installed by Homebrew during `brew install`. Users must configure their shell per [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

**Uninstall the binary:** `brew uninstall <key>`. Remove agent artifacts first (while the CLI is still on PATH):

```bash
<key> uninstall --yes
brew uninstall <tap>/<key>
```

## Developer install

```bash
just build
just install-local    # same formula as production; gen-dev-formula uses file:// URL (`just install` is an alias)
```

Dev flow matches release: formula `install` copies the binary and generates completions; `post_install` runs `<key> install --reinstall --yes` for skills/MCP. Use `just reinstall-local` to swap the binary into Cellar during tight edit cycles (skips completions and `post_install`). Use `just install-artifacts` to refresh agent artifacts without touching the binary.

## Quick reference

```bash
# Refresh skills/MCP after upgrade (Homebrew post_install runs this automatically)
<key> install --reinstall --yes

# See what is installed
<key> install --status

# Configure app settings (interactive wizard — not part of --all or post_install)
<key> install --configure

# Remove agent artifacts (default: --all)
<key> uninstall --yes
```

Non-interactive / CI: pass **`--yes`** (or **`--json`**, **`--reinstall`**) — see [Confirmation](#confirmation).

## What gets installed

| Target | Flag | Mechanism |
| --- | --- | --- |
| Binary | Homebrew formula | `bin.install` in Formula |
| Shell completions | Homebrew formula | `generate_completions_from_executable` |
| Cursor skill | `--skill` / `--all` | `~/.cursor/skills/<dir>/` when `~/.cursor` exists |
| Claude skill | `--skill` / `--all` | `~/.claude/skills/<dir>/` when `~/.claude` exists |
| Codex / OpenCode / OpenClaw skills | `--skill` / `--all` | Agent-specific dirs when available |
| MCP config | `--mcp` / `--all` | Cursor, Claude Code/Desktop, OpenCode, Codex, OpenClaw, ChatGPT desktop |
| App config | `--configure` | Interactive wizard writes `~/.local/lib/<key>/config.json` |

### Externally managed binary (Homebrew)

When **`PATH`** resolves the program key to the **running executable** (e.g. after `brew install`):

- **`install --status`** shows `app: system (PATH)`
- **`--all`** / **`--reinstall`** refresh skills and MCP only — not the binary or completions

MCP config uses the command name on **`PATH`**, not a Cellar path.

### Default `--all` behavior

Bare **`install`** and **`install --all`** install targets with **`includedInAll: true`**. Core defaults:

- **Agent integration** (`install.agentIntegration`, default from `mcpServer.enabled`):
  - **`skill`** (default when MCP off): all `*Skill` keys in `--all`; paired `*Mcp` keys excluded
  - **`mcp`** (default when `mcpServer.enabled`): all `*Mcp` keys in `--all`; paired skills excluded
  - **`both`**: MCP and skill for the same host when available
- **`configure`** is **opt-in** (`includedInAll: false`) — run **`install --configure`** separately

Desktop-only MCP hosts (`claudeDesktopMcp`, `chatgptMcp`) follow the MCP side only — no skill pair.

Scoped flags (`--skill`, `--mcp`, `--configure`) run that artifact category. Honor `enabled: false` as a hard off.

Use **`install --status --json`** to preview effective targets before installing.

### Asymmetric uninstall

The top-level **`uninstall`** command removes agent artifacts. Bare **`uninstall`** is equivalent to **`uninstall --all`**.

- **`uninstall --all`** removes **every detected artifact type**, ignoring `install.targets`.
- Scoped uninstall (`--skill`, `--mcp`, `--configure`, …) removes only that category.

Missing targets are skipped silently.

## `install.targets`

Configure which artifacts participate in `--all`, `--reinstall`:

```typescript
install: {
  agentIntegration: "mcp", // | "skill" | "both" — default from mcpServer.enabled
  targets: {
    chatgptMcp: false,
    cursorSkill: { includedInAll: true },
  },
},
```

`InstallTargetSpec` is `boolean` or `{ enabled?: boolean; includedInAll?: boolean }`.

Artifact keys: `chatgptMcp`, `claudeCodeMcp`, `claudeDesktopMcp`, `claudeSkill`, `codexMcp`, `codexSkill`, `configure`, `cursorMcp`, `cursorSkill`, `openclawMcp`, `openclawSkill`, `opencodeMcp`, `opencodeSkill`.

## App config (`program.appConfig`)

When `program.appConfig` is set, ArgsBarg manages a flat JSON config file at `~/.local/lib/<sanitized-key>/config.json`.

| Flag | Description |
| --- | --- |
| `--configure` | Interactive prompt; writes or updates the config file. **Not** included in `--all`. |
| `--status` | Shows config path and which required keys are set or missing |

Use **`uninstall --configure`** to remove the config directory.

Export helpers from `argsbarg`: `resolveAppConfigPath`, `displayAppConfigPath`.

## `uninstall` command

Sibling of `install` for removing agent artifacts:

```bash
<key> uninstall --yes              # all artifacts (default)
<key> uninstall --configure --yes  # config only
<key> uninstall --skill --yes      # skills only
```

Same behavior flags as install: `--yes`, `--dry`, `--json`. Does not support `--status` or `--reinstall`.

## Flags (`install`)

### Target flags

| Flag | Description |
| --- | --- |
| `--all` | Install the default agent artifact set for this app |
| `--skill` | Install agent skills |
| `--mcp` | Add MCP server configuration |
| `--configure` | Run the interactive configuration wizard |

### Operation flags (`install`)

| Flag | Description |
| --- | --- |
| `--status` | Read-only inventory |
| `--reinstall` | Refresh installed agent artifacts (Homebrew `post_install`; greenfield → full `--all` plan) |
| `--from <path>` | App executable reference for status detection (rare; default: running executable) |

### Behavior flags

| Flag | Description |
| --- | --- |
| `--yes`, `-y` | Skip confirmation |
| `--dry` | Preview changes |
| `--json` | Machine-readable output (implies `--yes`) |

## Confirmation

Install and uninstall (except `--yes`, `--json`, `--dry`, `--reinstall`) print a **`{app} Setup`** banner and numbered plan. Reply **`y`** for all, **`n`** or Enter to abort, or numbers for a subset.

## MCP merge behavior

When `--mcp` runs, entries are merged into host config with:

```json
{ "command": "<root.key>", "args": ["mcp"] }
```

If an existing entry differs, the command exits with an error unless `--yes` is passed.

## Formula `post_install`

Release formulae should run:

```ruby
def post_install
  system bin/"myapp", "install", "--reinstall", "--yes"
end
```

This refreshes skills/MCP without running the configure wizard (configure is opt-in).

## Bootstrapping a new CLI

```bash
bunx argsbarg create my-cli --key my-cli --class-name MyCli --tap org/repo --yes
bunx argsbarg create --check .
```

See [distribution-homebrew.md](distribution-homebrew.md) and [../examples/full-example/README.md](../examples/full-example/README.md).

## Opt out

```typescript
install: { enabled: false },
```
