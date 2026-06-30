# Install command

The `install` built-in installs the app, shell completions, agent skills, and MCP config. Opt out with `install: { enabled: false }` on the program root.

## End-user install

Ship a compiled binary (or app bundle). Users install interactively — no `--yes` required when stdin is a TTY:

- **Terminal:** run `./myapp`, `myapp`, or `myapp install` (bare `install` is equivalent to `--all`).
- **macOS app:** double-click the `.app`; when the binary is not yet on PATH and stdin is a TTY, launching with no arguments bootstraps to **`myapp install`**.

Interactive flow prints a **`{app} Setup`** banner, a numbered plan, and a confirm prompt. When the app needs API keys or other settings, a **`Configuration Setup`** section runs after install (or immediately for **`install --configure`**).

**Uninstall is CLI-only** — there is no GUI uninstaller. Users run:

```bash
myapp install --uninstall          # remove all detected artifacts
myapp install --uninstall --app    # scoped removal
```

Non-interactive / CI: pass **`--yes`** (or **`--json`**, **`--reinstall`**, **`--update`**) — see [Confirmation](#confirmation).

## Quick start (automation)

```bash
# First-time setup (bare `install` is equivalent to `--all`)
myapp install --yes

# Or explicitly
myapp install --all --yes

# Refresh after upgrading (re-copy running app + refresh detected artifacts in scope)
myapp install --reinstall

# Upgrade to latest release (when this app supports remote updates)
myapp install --update

# See what is installed
myapp install --status

# Remove everything detected on disk (bare `install --uninstall` is equivalent to `--uninstall --all`)
myapp install --uninstall --yes
```

## What gets installed

| Target | Flag | Destination |
| --- | --- | --- |
| App | `--app` | `~/.local/bin/<key>` |
| Bash completion | `--completions` | `~/.bash_completion.d/<key>` + `.bashrc` PATH snippet |
| Zsh completion | `--completions` | `~/.zsh/completions/_<key>` + `.zshrc` fpath snippet |
| Fish completion | `--completions` | `~/.config/fish/completions/<key>.fish` |
| Cursor skill | `--skill` | `~/.cursor/skills/<dir>/` when `~/.cursor` exists |
| Claude skill | `--skill` | `~/.claude/skills/<dir>/` when `~/.claude` exists |
| Codex / OpenCode / OpenClaw skills | `--skill` | Agent-specific dirs when the agent home or CLI is available |
| MCP config | `--mcp` | Cursor, Claude Code/Desktop, OpenCode, Codex, OpenClaw, ChatGPT desktop (when app data exists). ChatGPT web uses Connectors — see `docs mcp` |
| App config | `--configure` | Interactive wizard writes app settings; `--uninstall --configure` removes the file |

### Default `--all` behavior

Bare **`install`** and **`install --all`** install targets with **`includedInAll: true`**. Core defaults:

- **Always included:** `app`, `completions`, `configure` (wizard when `program.appConfig` is set)
- **Agent integration** (`install.agentIntegration`, default from `mcpServer.enabled`):
  - **`skill`** (default when MCP off): all `*Skill` keys in `--all`; paired `*Mcp` keys excluded
  - **`mcp`** (default when `mcpServer.enabled`): all `*Mcp` keys in `--all`; paired skills excluded
  - **`both`**: MCP and skill for the same host when available

Desktop-only MCP hosts (`claudeDesktopMcp`, `chatgptMcp`) follow the MCP side only — no skill pair.

Scoped flags (`--app`, `--completions`, `--configure`) run that artifact category. **`--skill`** and **`--mcp`** install only targets enabled by `agentIntegration` and per-key `install.targets`. Honor `enabled: false` as a hard off.

Use **`install --status --json`** to preview effective targets (`effective.all`, `effective.mcp`, `effective.skill`) before installing.

### Asymmetric uninstall

- **`install --uninstall --all`** (including bare **`install --uninstall`**) removes **every detected artifact type**, ignoring `install.targets`.
- Scoped uninstall (`--app`, `--skill`, …) removes only that category.

Missing targets are skipped silently (no error if nothing is on disk or a shell/agent directory does not exist). Shells not on PATH are skipped silently (no warnings).

## `install.targets`

Configure which artifacts participate in `--all`, `--reinstall`, and `--update`:

```typescript
install: {
  agentIntegration: "mcp", // | "skill" | "both" — default from mcpServer.enabled
  targets: {
    app: { includedInAll: false },
    chatgptMcp: false,
    cursorSkill: { includedInAll: true },
  },
},
```

`InstallTargetSpec` is `boolean` or `{ enabled?: boolean; includedInAll?: boolean }`. Shorthand `true` enables the target with default `includedInAll`; `false` disables it.

Artifact keys: `app`, `chatgptMcp`, `claudeCodeMcp`, `claudeDesktopMcp`, `claudeSkill`, `codexMcp`, `codexSkill`, `completions`, `configure`, `cursorMcp`, `cursorSkill`, `openclawMcp`, `openclawSkill`, `opencodeMcp`, `opencodeSkill`.

Conflicting targets (e.g. both `cursorMcp` and `cursorSkill` without `agentIntegration: 'both'`) fail at program validation time.

## Examples

### MCP CLI (default)

```typescript
const program = {
  key: "myapp",
  version: "1.0.0",
  description: "…",
  mcpServer: { enabled: true },
  install: {}, // agentIntegration defaults to "mcp"
  // …
} satisfies CliProgram;
```

Bare **`myapp install --yes`** installs the app, completions, configure wizard (when `appConfig` is set), and MCP hosts — not shell skills for paired agents.

### Shell-only CLI (default)

```typescript
const program = {
  key: "myapp",
  version: "1.0.0",
  description: "…",
  install: {}, // agentIntegration defaults to "skill"
  // …
} satisfies CliProgram;
```

Bare install includes agent skills (when each host is available), not MCP config.

### Overrides

```typescript
install: {
  agentIntegration: "both", // MCP + skill on the same host
  targets: {
    chatgptMcp: false, // opt out of one MCP host
    app: { includedInAll: false }, // skip app on --all
  },
},
```

Preview resolved targets: **`myapp install --status --json`**.

## Configuration

On the program root:

```typescript
install: {
  enabled: false,       // opt out of the install built-in
  updateGetLatest: async ({ version }) => {
    // download or locate latest release; return { path, version, cleanup }
    return { path: "/tmp/myapp", version: "2.0.0" };
  },
}
```

When `updateGetLatest` is set, ArgsBarg adds **`install --update`** (download latest release and reinstall installed artifacts in scope).

### GitHub releases (`ghReleaseUpdateGetLatest`)

For compiled apps published via `gh release`, wire a hook without hand-rolling download logic:

```typescript
import {
  createGhFetchLatest,
  createGhVersionCheck,
  ghReleaseUpdateGetLatest,
} from "argsbarg";

const cachePath = path.join(configDir, "version-check.json");

install: {
  updateGetLatest: ghReleaseUpdateGetLatest({
    repo: "owner/repo",
    asset: "myapp",
    tempPrefix: "myapp-update.",
    cachePath,
  }),
}

// Optional: summary notice + background refresh
const versionCheck = createGhVersionCheck({
  currentVersion: "1.0.0",
  commandName: "myapp",
  cachePath,
  fetchLatest: createGhFetchLatest({ repo: "owner/repo" }),
});
versionCheck.getUpdateNotice();
versionCheck.refreshIfStale();
```

Requires `gh` on PATH and `gh auth login`. Consumers keep app-specific config only (~15 lines).

## App config (`program.appConfig`)

When `program.appConfig` is set on the program root, ArgsBarg manages a flat JSON config file:

```typescript
appConfig: {
  entries: {
    apiToken: {
      description: "Create at https://example.com/settings/tokens",
      env: "API_TOKEN",
      sensitive: true,
    },
  },
},
```

Config file path: `~/.local/lib/<sanitized-key>/config.json`.

| Flag | Description |
| --- | --- |
| `--configure` | Interactive prompt for each setting; writes or updates the config file. On full install, the wizard runs automatically when configuration is in scope. Standalone **`install --configure`** runs the wizard only (no other install steps). |
| `--uninstall --configure` | Remove the config directory (`~/.local/lib/<key>/`) |
| `--status` | Shows config path and which required keys are set or missing |

**Configure UX** (TTY):

```
Configuration Setup

API token (API_TOKEN)
  Create at https://example.com/settings/tokens
  Current: REDACTED
  Value (Enter to copy from env):
```

Non-sensitive vars show the current value; first-time setup omits the `Current:` line. When the current value comes from a mapped environment variable, Enter copies it into `config.json`; otherwise Enter keeps the existing file value. At runtime, a non-empty mapped environment variable always wins over `config.json` (the file is the fallback when env is unset).

## Flags

### Target flags

| Flag | Description |
| --- | --- |
| `--all` | Install the default set (app, shell completions, and configuration when supported) |
| `--app` | Copy this app to the install directory |
| `--completions` | Install bash, zsh, and fish tab-completion scripts |
| `--skill` | Install agent skills for Cursor, Claude, and other supported AI tools |
| `--mcp` | Add MCP server configuration for Cursor, Claude Code, and other supported agents |
| `--configure` | Run the configuration wizard (install) or remove the config file (`--uninstall`) |

### Operation flags

| Flag | Description |
| --- | --- |
| `--status` | Read-only inventory |
| `--reinstall` | Refresh everything already installed (implies `--yes`; no numbered confirm) |
| `--update` | Download the latest release and refresh installed files (implies `--yes`) |
| `--uninstall` | Remove installed files (`--all` removes everything; use individual flags for one category) |
| `--from <path>` | App executable to copy with `--reinstall` / `--update` (default: running executable) |

### Behavior flags

| Flag | Description |
| --- | --- |
| `--yes`, `-y` | Skip confirmation (required for non-TTY unless `--json`, `--reinstall`, or `--update`) |
| `--dry` | Preview changes; per-step messages on stderr with `[dry run]` |
| `--json` | Machine-readable output on stdout (implies `--yes`) |

## Confirmation

Install and uninstall (except `--yes`, `--json`, `--dry`, `--reinstall`, `--update`) print a **`{app} Setup`** banner on stderr, then a numbered list of planned actions on stdout. Reply **`y`** for all, **`n`** or Enter to abort, or numbers for a subset. On **install**, when the plan includes the app as item **1**, it is always installed (prompt example: **`2,3`**); MCP and other targets need the binary on PATH. On **uninstall**, use any subset (e.g. **`1,3`**). After you confirm, **`Done.`** prints on stderr. Per-step progress is suppressed until you confirm; the final **`Installed N file(s).`** summary still prints.

## MCP merge behavior

When `--mcp` runs, entries are merged into host config with:

```json
{ "command": "<root.key>", "args": ["mcp"] }
```

If an existing entry differs, the command exits with an error unless `--yes` is passed (then it overwrites). MCP conflict checks run only for hosts present in the current plan.

## Opt out

```typescript
const cli = {
  key: "myapp",
  description: "...",
  install: { enabled: false },
  // ...
} satisfies CliProgram;
```
