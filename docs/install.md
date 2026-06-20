# Install command

The `install` built-in installs the binary, shell completions, agent skills, and MCP config. Opt out with `install: { enabled: false }` on the program root.

## Quick start

```bash
# First-time setup
myapp install --all --yes

# Refresh after upgrading (re-copy running binary + refresh installed artifacts)
myapp install --reinstall

# Download latest release (when install.updateGetLatest is configured)
myapp update

# See what is installed
myapp install --status

# Remove everything detected
myapp install --uninstall --yes
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
| MCP config | `--mcp` | `~/.cursor/mcp.json` and `~/.claude.json` when MCP is enabled |

`--all` expands to `--bin`, `--completions`, `--skill`, and `--mcp` (when `mcpServer.enabled` is `true`).

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

When `updateGetLatest` is set, ArgsBarg also registers the **`update`** built-in (`myapp update`).

Environment:

- `INSTALL_PREFIX` — same as `install.prefix` / `--prefix`

## Flags

| Flag | Description |
| --- | --- |
| `--yes` | Skip confirmation (required for non-TTY unless `--json` / `--reinstall`) |
| `--dry` | Preview changes; per-step messages on stderr with `[dry run]` |
| `--json` | Machine-readable output on stdout (implies `--yes`) |
| `--quiet` | Suppress summaries and per-step messages (requires `--yes`) |
| `--prefix <dir>` | Override binary install directory |
| `--reinstall` | Reinstall artifacts already on disk (implies `--bin` + `--yes`) |
| `--from <path>` | Binary to copy with `--reinstall` (default: running executable) |
| `--status` | Read-only inventory |
| `--uninstall` | Remove detected artifacts (scope with `--bin`, `--completions`, `--skill`, `--mcp`) |

`--update` is accepted as a deprecated alias for `--reinstall`.

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
