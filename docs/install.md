# Install command

The `install` built-in installs the binary, shell completions, agent skills, and MCP config. Opt out with `install: { enabled: false }` on the program root.

## Quick start

```bash
# First-time setup
myapp install --all --yes

# Refresh after upgrading (re-copy running binary + refresh installed artifacts)
myapp install --reinstall

# Upgrade to latest release (when install.updateGetLatest is configured)
myapp install --update

# See what is installed
myapp install --status

# Remove everything installed with --all
myapp install --uninstall --all --yes
```

## What gets installed

| Target | Flag | Destination |
| --- | --- | --- |
| Binary | `--bin` | `~/.local/bin/<key>` (or `--prefix`) |
| Bash completion | `--completions` | `~/.bash_completion.d/<key>` + `.bashrc` PATH snippet |
| Zsh completion | `--completions` | `~/.zsh/completions/_<key>` + `.zshrc` fpath snippet |
| Fish completion | `--completions` | `~/.config/fish/completions/<key>.fish` |
| Cursor skill | `--skill` | `~/.cursor/skills/<dir>/` when `~/.cursor` exists |
| Claude skill | `--skill` | `~/.claude/skills/<dir>/` when `~/.claude` exists |
| MCP config | `--mcp` | Cursor, Claude Code/Desktop, OpenCode (`~/.config/opencode`), Codex (`codex` on PATH), ChatGPT desktop (when app data exists). ChatGPT web uses Connectors — see `docs mcp` |
| App config | `--config` | JSON config file for `program.appConfig` (with `--uninstall`; included in `--uninstall --all`) |

`--all` expands to `--bin`, `--completions`, `--skill`, and `--mcp` (when `mcpServer.enabled` is `true`) for both install and uninstall. Missing targets are skipped silently (no error if nothing is on disk or a shell/agent directory does not exist).

`install --uninstall` requires the same target flags as install (`--all`, `--bin`, etc.) — bare `--uninstall` alone is an error.

Shells not on PATH are skipped silently (no warnings).

## Configuration

On the program root:

```typescript
install: {
  enabled: false,       // opt out of the install built-in
  prefix: "~/.local/bin", // default bin directory
  updateGetLatest: async ({ version }) => {
    // download or locate latest binary; return { path, version, cleanup }
    return { path: "/tmp/myapp", version: "2.0.0" };
  },
}
```

When `updateGetLatest` is set, ArgsBarg adds **`install --update`** (download latest release and reinstall installed artifacts).

### GitHub releases (`ghReleaseUpdateGetLatest`)

For compiled binaries published via `gh release`, wire a hook without hand-rolling download logic:

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

Environment:

- `INSTALL_PREFIX` — same as `install.prefix` / `--prefix`

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
  path: "~/.config/myapp/config", // optional; default is OS-specific
},
```

Default path: `$XDG_CONFIG_HOME/<sanitized-key>/config` (Linux/macOS) or `%APPDATA%/<key>/config` (Windows).

| Flag | Description |
| --- | --- |
| `--configure` | Interactive prompt for each schema entry; writes or updates the config file (standalone — not part of `--all`) |
| `--uninstall --config` | Remove the config file (included in `--uninstall --all`) |
| `--status` | Shows config path and which required keys are set or missing |

**Configure UX** (TTY):

```
API token
  Create at https://example.com/settings/tokens
Current: REDACTED
Value (Enter to keep):
```

Non-sensitive vars show the current value; first-time setup omits the `Current:` line.

## Flags

| Flag | Description |
| --- | --- |
| `--yes` | Skip confirmation (required for non-TTY unless `--json`, `--reinstall`, or `--update`) |
| `--dry` | Preview changes; per-step messages on stderr with `[dry run]` |
| `--json` | Machine-readable output on stdout (implies `--yes`) |
| `--quiet` | Suppress summaries and per-step messages (requires `--yes`) |
| `--prefix <dir>` | Override binary install directory |
| `--reinstall` | Reinstall artifacts already on disk (implies `--bin` + `--yes`) |
| `--update` | Download latest release and reinstall installed artifacts (requires `install.updateGetLatest`; implies `--yes`) |
| `--from <path>` | Binary to copy with `--reinstall` (default: running executable) |
| `--status` | Read-only inventory |
| `--uninstall` | Remove artifacts in scope (`--all`, `--bin`, `--completions`, `--skill`, `--mcp`, `--config`); skips targets not installed |

## MCP merge behavior

When `--mcp` runs, entries are merged into `mcpServers[<sanitized-key>]` with:

```json
{ "command": "<root.key>", "args": ["mcp"] }
```

If an existing entry differs, the command exits with an error unless `--yes` is passed (then it overwrites).

## Opt out

```typescript
const cli = {
  key: "myapp",
  description: "...",
  install: { enabled: false },
  // ...
} satisfies CliProgram;
```
