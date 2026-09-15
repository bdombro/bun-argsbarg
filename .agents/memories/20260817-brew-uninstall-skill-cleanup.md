# Made with /thread-memory

## Meta
updated: 2026-08-17 16:50
id: 64af7f26-5d9d-40af-a261-fb3f7dd766de
thread: brew uninstall skill cleanup
scope: docs/configure.md, docs/distribution-homebrew.md, src/configure/**, src/skill/**
topics: brew-uninstall, configure-uninstall, legacy-skill-paths, stale-skill-cleanup
counts: 2 decision, 2 footgun

## 2026-08-17 16:30 decision
brew uninstall does not remove agent skills by itself
context: User asked whether stale skills after brew uninstall is expected for argsbarg-powered apps.
decision: No — but current model does not rely on a Homebrew formula uninstall hook. Users must run `<key> configure uninstall` (or `configure uninstall --yes`) while the binary is still on PATH, then `brew uninstall <tap>/<key>`. `configure uninstall` removes `~/.agents/skills/<skillDirName>/`, MCP entry in `~/.agents/mcp.json`, and app config under `~/.local/lib/<key>/`.
paths: docs/configure.md, docs/distribution-homebrew.md, src/configure/index.ts

## 2026-08-17 16:35 footgun
brew uninstall alone leaves agent artifacts
fails: Running only `brew uninstall` removes the Cellar binary and completions but does not touch `~/.agents/` skill or MCP files. Stale skills remain until `configure uninstall` runs or dirs are removed manually.
paths: docs/configure.md, src/configure/artifacts/paths.ts

## 2026-08-17 16:40 footgun
Legacy per-host skill dirs are outside configure uninstall
fails: Older argsbarg installs wrote skills to per-host paths (`~/.cursor/skills/<key>/`, `~/.claude/skills/<key>/`, `~/.codex/skills/<key>/`, `~/.config/opencode/skills/<key>/`, `~/.openclaw/skills/<key>/`). Current `configure uninstall` only removes `~/.agents/skills/<skillDirName>/`. Legacy dirs survive uninstall and need manual `rm -rf`.
paths: src/configure/artifacts/paths.ts, src/skill/install.ts

## 2026-08-17 16:45 decision
Manual cleanup of stale sqsp_i18n and sqsp_qa legacy skills
context: User requested removal of stale `sqsp_i18n` and `sqsp_qa` skills across all install targets after prior brew uninstalls.
decision: Removed legacy dirs that existed: `~/.cursor/skills/sqsp_i18n`, `~/.cursor/skills/sqsp_qa`, `~/.claude/skills/sqsp_qa`. No matching dirs under `~/.codex/skills/`, `~/.config/opencode/skills/`, or `~/.openclaw/skills/`. For future legacy sweeps, check all five per-host bases plus `~/.agents/skills/`.
paths: (process)
