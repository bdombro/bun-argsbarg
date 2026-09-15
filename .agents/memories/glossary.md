# Made with /thread-memory

## Meta
updated: 2026-08-17 16:50
scope: src/**, docs/**, examples/**, CHANGELOG.md, .cursor/skills/**
counts: 11 terms

## Terms
cliprogram-field-order:
current: Program-root objects and CliProgram extension type fields are alphabetical. Extension order: appConfig, completion, configure, docs, hooks, httpServer, log, mcpServer, readiness, skill, version. Leaf roots: description, handler, key, notes, options, positionals, version (include only keys present).

collectPathOptionDefs:
current: Post-parse helper in src/core/parse.ts that collects options from the program root plus each routing segment on the command path (for validation). Distinct from collectOptionDefs, which returns only the leaf command's options.

configure-install:
current: argsbarg 7.0 subcommand replacing bare configure and --refresh. Installs agent artifacts, bootstraps config.json, runs required-config wizard on TTY when appConfig entries exist, then afterInstall hook. Non-TTY with missing required config exits 1 unless env resolves values.

configure-uninstall:
current: `configure uninstall` (or `configure uninstall --yes`). Run before `brew uninstall` while binary is on PATH. Removes `~/.agents/skills/<skillDirName>/`, MCP entry in `~/.agents/mcp.json`, and app config. Homebrew formula does not invoke this automatically.

consumers-sync:
current: Root justfile recipe: bun add argsbarg@^version, merge-agents-md.ts per consumer, then just build && just docgen && just install-local per consumer_apps path. install-local brew post_install runs configure install/sync on the Cellar binary; skill install requires program.skill.enabled in that binary at install time.
  was 2026-08-17: bun add, merge AGENTS.md, build + docgen + install-local; install-local already includes build (redundant second build/docgen pass).

create-templates:
current: argsbarg create copy templates: cli (examples/full-example, default) and json (examples/full-example-json). --template cli|json; interactive A/B picker when TTY; create-identity.template for --check drift. json template runs schemagen in post-create; cli template does not.

file-bin-shim:
current: Bun file:../.. installs link node_modules/.bin/argsbarg to src/index.ts. Fix: ln -sf ../argsbarg/bin/argsbarg node_modules/.bin/argsbarg after bun install in example just setup and consumers-dev.

leaf-local-options:
current: Breaking 8.0 rule — CLI options apply only on the command node where declared. Program root may still declare options; routing groups cannot. Parse consumes current.options per router level; MCP/HTTP/OpenAPI/skills expose leaf-local options only.

leafWireOptions:
current: Helper in src/mcp/tools.ts (and mirrored in HTTP/OpenAPI/skill generators) — leaf-local options minus framework-handled presence flags json, yes, and verbose. MCP auto-injects --yes on invoke when the leaf declares a yes option.

legacy-skill-paths:
current: Pre-7.0 per-host skill dirs not managed by current configure uninstall: `~/.cursor/skills/<key>/`, `~/.claude/skills/<key>/`, `~/.codex/skills/<key>/`, `~/.config/opencode/skills/<key>/`, `~/.openclaw/skills/<key>/`. Manual removal required after migration or stale uninstall.

program-skill:
current: Opt-in via program.skill.enabled === true. configure install writes generated bundle to ~/.agents/skills/<skillDirName(key)>/ (skillDirName sanitizes /, \, spaces to _). No per-host skill targets or configure.agentIntegration.
