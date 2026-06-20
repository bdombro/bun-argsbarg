# Install command

The `install` built-in is available only in **compiled binaries** (`bun build --compile`). It is hidden from help, `--schema`, and shell completions when running via `bun run`.

## Quick start

```bash
# First-time setup
myapp install --all --yes

# Refresh after upgrading
myapp install --update

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

`--all` expands to `--bin`, `--completions`, `--skill`, and `--mcp` (when `mcpServer` is set).

Shells not on PATH are skipped silently (no warnings).

## Configuration

On the program root:

```typescript
install: {
  enabled: false,       // opt out of the install built-in
  prefix: "~/.local/bin", // default bin directory
}
```

Environment:

- `INSTALL_PREFIX` — same as `install.prefix` / `--prefix`

## Flags

| Flag | Description |
| --- | --- |
| `--yes` | Skip confirmation (required for non-TTY unless `--json` / `--update`) |
| `--dry` | Preview changes; per-step messages on stderr with `[dry run]` |
| `--json` | Machine-readable output on stdout (implies `--yes`) |
| `--quiet` | Suppress summaries and per-step messages (requires `--yes`) |
| `--prefix <dir>` | Override binary install directory |
| `--update` | Update only artifacts already installed (implies `--bin` + `--yes`) |
| `--status` | Read-only inventory |
| `--uninstall` | Remove detected artifacts (scope with `--bin`, `--completions`, `--skill`, `--mcp`) |

## MCP merge behavior

When `--mcp` runs, entries are merged into `mcpServers[<name>]` with:

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
