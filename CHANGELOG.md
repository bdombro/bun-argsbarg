# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.1.15] - 2026-07-06


## [5.1.14] - 2026-07-06


## [5.1.13] - 2026-07-06

### Fixed

- **`configure --remove-all`** — skill uninstall actions no longer reinstall skills after printing "Removing …".
- **Interactive `configure`** — choosing `n` on an installed skill now removes the skill directory (same bug as `--remove-all`, different code path).
- **Configure closing summary** — counts artifacts (not per-file paths) and uses Removed/Installed/Synced instead of always "Updated N file(s)."

### Changed

- **Homebrew formula `uninstall`** — generated formulae run `{key} configure --remove-all --yes` (skills, MCP, and app config).

### Changed

- **`scripts/dev-formula.ts`** — `install` stages a `file://` dev formula; `reset` restores the release formula. `just install-local` orchestrates stage → `brew install` → reset.

## [5.1.11] - 2026-07-05


## [5.1.10] - 2026-07-05

### Added

- **Zip release assets** — Homebrew formulae download `{key}.zip` from GitHub Releases; `buildReleaseArchive` in `formula-shared.ts`; `just release --purge` to delete stale releases.

### Changed

- **Release workflow** — `scripts/release.ts` uploads a zip archive (smaller download) instead of a bare Mach-O binary; formula `sha256` pins the archive.

## [5.1.9] - 2026-07-05

### Added

- **`configure --sync` config bootstrap** — creates `~/.local/lib/<key>/config.json` as `{}` when missing (all apps; Homebrew `post_install`).
- **`_bindings` metadata** — per-key intent (`env` | `file` | `skip`) in config file; wizard persists env/skip choices; `configure set --from-env`.
- **`ctx.appConfig` unsafe I/O** — `getUnsafe`, `setUnsafe`, `readUnsafe` for raw file access (works without `program.appConfig`).

### Changed

- **App config detection** — `appConfigInstalled` / `--status` use file existence only (not directory-only).
- **Configure wizard** — skips addressed keys; Enter at env prompt persists `_bindings`; accurate write messaging.
- **`configure --status`** — binding hints on required keys (`set (env)`, etc.).
- **Partial config validation** — single-key / bindings-only writes skip required-property checks.
- biome lineLength=120

## [5.1.8] - 2026-07-05


## [5.1.7] - 2026-07-05

### Changed

- **Homebrew install docs** — private taps: `brew install gh` and `gh auth login` only; removed legacy token env-var setup from docs and justfiles (template + consumers).
- **App config array input** — interactive `configure` and `configure set` parse homogeneous primitive arrays from comma-separated values or JSON literals; objects and nested arrays still require `--json`.
- **Homebrew formula `uninstall`** — generated formulae run `{key} configure --remove-config --yes` before the keg is removed (template + docs).

## [5.1.6] - 2026-07-05


## [5.1.5] - 2026-07-05

### Changed

- **`just install-local`** — back up release `Formula/{key}.rb`, write dev formula for `brew install`, then restore (`scripts/with-dev-formula.ts`; dropped `gen-dev-formula.ts` / `dev-formula.ts`).

## [5.1.4] - 2026-07-04

### Changed

- **Template justfile** — removed `scripts/ensure-brew-github-token.sh` and `HOMEBREW_NO_*` suppress vars.

## [5.1.3] - 2026-07-04

## [5.1.2] - 2026-07-04

### Changed

- **Private GitHub release installs** — release formulae use `GitHubPrivateReleaseDownloadStrategy` (GitHub API + `GitHub::API.credentials`); documented in `docs/distribution-homebrew.md`.
- **Homebrew install docs** — README template and consumer READMEs document private-tap install; `configure` CLI notes stay post-install only.

## [5.1.1] - 2026-07-04

### Fixed

- **Configure without MCP** — skill-only apps (`mcpServer` unset) no longer prompt for MCP host config during interactive `configure`; MCP install targets default to disabled unless `mcpServer.enabled` is true.

### Changed

- **Internal DRY refactors** — shared bash/zsh completion simulate emitters, module-level `errorResult()` in the parser, unified configure stdin prompt via `readPromptLine`, and a shared `mcpServerRequiredForArtifact` predicate linking install defaults with schema validation.

## [5.1.0] - 2026-07-04

### Changed

- **Breaking: `config get`/`set` → `configure get`/`set`** — top-level `config` removed; app config introspection lives under the `configure` built-in.

## [5.0.3] - 2026-07-04

### Changed

- **JSDoc style** — short `test()` callbacks no longer carry redundant one-liners; `describe` blocks still documented. `requireYesInNonTty` uses per-parameter JSDoc instead of `@param`. Pure re-export barrels stay comment-free.

## [5.0.2] - 2026-07-04

### Changed

- **JSDoc style** — every `describe` block in `src/**/*.test.ts` now has a human-readable JSDoc; `configure` modules brought in line with file headers and symbol docs.

## [5.0.1] - 2026-07-04


## [5.0.0] - 2026-07-03

### Added

- **Top-level `configure` built-in** — interactive per-target wizard (TTY required); non-interactive `--sync --yes` (replaces `install --reinstall`), `--remove-all --yes`, `--remove-config --yes`, and `--status`.
- **`configure --remove-config --yes`** — config-only removal without touching skills/MCP.

### Changed

- **Breaking: `install` and `uninstall` removed** — use `configure` and its flags; no redirects or deprecated aliases.
- **Breaking: `program.install` → `program.configure`** — `CliConfigureConfig`, `CliConfigureTargets`, `caps.configure`.
- **Breaking: `completion` hidden** from help and exported schema; still callable for Homebrew `generate_completions_from_executable`.
- **Breaking: skill install hint** — `Generated by … configure` (was `install --skill`).
- **Formula `post_install`** — `configure --sync --yes` (was `install --reinstall --yes`).
- **Just recipes** — `sync-artifacts`, `configure --remove-all --yes`, `configure --remove-config --yes`.
- **Docs** — `docs/install.md` replaced by [docs/configure.md](docs/configure.md).

### Removed

- Top-level **`install`** and **`uninstall`** commands and all scoped install/uninstall flags (`--all`, `--skill`, `--mcp`, `--reinstall`, …).

## [4.1.1] - 2026-07-03

### Added

- **`argsbarg create`** — interactive bootstrap from `examples/full-example`; copies template with substitutions; post-create runs `bun install`, schemagen, Cursor rule merge, `bun test`, and git init when appropriate.

### Changed

- **Breaking: `bunx argsbarg scaffold homebrew` → `bunx argsbarg create`** — single template in `examples/full-example/`; removed `docs/templates/homebrew/`.
- **`examples/full-example/`** — `src/index.ts`, per-command modules, Biome, `.cursor/rules/` (`cli-program.mdc`, `code.mdc`).

### Removed

- **`argsbarg scaffold`** subcommands and **`docs/templates/homebrew/`**.

### Added

- **`CliAppConfigEntry.resolve`** — optional per-key fallback resolver after file (e.g. `gh auth token`); return `undefined` to fall back to `entry.env` and defaults. Resolution order: env → file → `resolve` → env → default.
- **Install `--mcp` / `--skill` / `--configure` combined** — scoped flags compose (configure no longer blocks skill/MCP plan); configure wizard runs after install when combined.
- **Top-level `uninstall` command** — sibling of `install` for removing agent artifacts; bare `uninstall` defaults to `--all`.
- **Homebrew-first distribution** — tap-from-repo formula pattern; [docs/distribution-homebrew.md](docs/distribution-homebrew.md).
- **Homebrew dev just recipes** — `install-local`, `reinstall-local`, `install-production` (+ `install` / `reinstall` aliases); `uninstall`, `uninstall-config`, `uninstall-release`, `uninstall-release-tap`, `test-release` in full-example template.
- **CLI bin split** — `argsbarg` package bin points to `src/cli-tool/main.ts`; library API remains `import from "argsbarg"`.
- **Config path exports** — `resolveAppConfigPath`, `displayAppConfigPath` exported from `argsbarg`.
- **`--reinstall` greenfield fallback** — when no artifacts detected, `--reinstall` runs full `--all` plan (fresh `brew install` post_install).

### Changed

- **`mcpServer.shellEnv` default on** — login-shell env is captured at MCP startup unless `shellEnv: false`. PATH is merged; other vars fill gaps in host env.
- **`CliAppConfigEntry.resolve` must be synchronous** — returning a Promise is ignored with a stderr warning; use `Bun.spawnSync` with piped stdout for subprocess resolvers (e.g. `gh auth token`).

- **Breaking: `examples/consumer-app/` → `examples/full-example/`** — expanded justfile (dev/build/test/schemagen + Homebrew); CLI key `full-example`; removed redundant `examples/config-app/`.

- **Breaking: `install --uninstall` removed** — use `<key> uninstall` instead (`install --uninstall` exits with a redirect message).
- **Breaking: Homebrew-only install model** — drop self-install to `~/.local/bin`, `install --app`, `install --update` / `updateGetLatest`, home-dir completion installer (`install --completions`), bare-argv install bootstrap.
- **Breaking: configure opt-in** — `configure` target excluded from `--all`; no post-install wizard; run `install --configure` explicitly.
- **Install `--all` / `--reinstall`** — skills and MCP only (binary + completions via Homebrew formula).
- **Completion built-in notes** — Homebrew installs completions; link to Shell-Completion docs.

### Removed

- **`examples/config-app/`** — superseded by `full-example` (`program.appConfig`, schemagen, and `config get`/`set` covered there).
- **`install --update`**, **`updateGetLatest`**, **`ghReleaseUpdateGetLatest`** usage in install flow.
- **Completion installer** — `install/targets/completions.ts`, home-dir completion paths.
- **Install bootstrap** — bare argv no longer rewrites to `install`.

## [4.1.0] - 2026-07-01

### Added

- **Install bootstrap** — bare `myapp` (empty argv, TTY, binary not on PATH) rewrites to `myapp install`.
- **Interactive install banner** — TTY install/uninstall prints `{app} Setup` before the numbered plan; config wizard uses `Configuration Setup`.
- **Config file** — path is `~/.local/lib/<sanitized-key>/config.json`. Configure wizard writes accepted values (including Enter to copy from env) to the file.
- **`install.targets`** — `InstallTargetSpec` per artifact; `install.agentIntegration` for MCP vs skill defaults.
- **Agent install targets** — `codexSkill`, `opencodeSkill`, `openclawSkill`, `openclawMcp`.
- **Install status JSON** — `install --status --json` includes `agentIntegration` and `effective` target preview.
- **`mcpServer.mcpd`** — opt-in Claude Desktop `.mcpb` from `mcp bundle` (default off).
- **`mcpServer.claudePlugin`** — opt-in Claude Code plugin zip from `mcp bundle` (default off).

### Changed

- **Sensitive config prompts** — `sensitive: true` entries disable terminal echo (raw-mode read with `*` feedback); Ctrl+C exits as usual.
- **Breaking: `install --all`** — includes agent targets per `agentIntegration` (skills when MCP off, MCP when `mcpServer.enabled`); not both for the same host unless `both`.
- **Scoped `--skill` / `--mcp`** — install only targets enabled by `agentIntegration` + `install.targets`, not every host in the category.
- **Breaking: `--config` removed** — use **`--configure`** (install = wizard; uninstall = remove config directory).
- **Breaking: `program.appConfig.path` removed** — config file is always `~/.local/lib/<sanitized-key>/config.json`.
- **Breaking: `--quiet` removed** from `install`.
- **Breaking: `--prefix` removed** — app always installs to `~/.local/bin/<key>`.
- **Breaking: `install.prefix` and `INSTALL_PREFIX` removed** — custom install locations are not supported.
- **Breaking: `--reinstall` / `--update`** — refresh detected artifacts in effective target scope (not bin-only).
- **Breaking: `mcp bundle`** — writes artifacts only when `mcpServer.mcpd` and/or `mcpServer.claudePlugin` is true (both default off).
- **Breaking: bare `install --uninstall`** — equivalent to `--uninstall --all` (removes all detected artifacts; ignores `install.targets`).
- **Claude plugin zip** — `plugin.json` includes `"mcpServers": ".mcp.json"` so Claude Desktop/Code load the bundled MCP server; `bin/<key>` retains executable permissions in the zip.

## [4.0.4] - 2026-06-25

### Added

- **MCP docs topic resources** — when `docs.enabled` and `mcpServer.enabled`, each user `docs.topics` key is auto-exposed as `<mcpId>://docs/<topicKey>` (`text/markdown`, same body as `myapp docs <topic>`). Built-in `docs schema` / `api` / `skill` / `mcp` are not auto-exposed.

### Changed

- **Claude Code plugin skill** — `mcp bundle` plugin zip includes an MCP routing `SKILL.md` only (no shell catalog, no `reference.md`). `install --skill` unchanged.
- **Validation** — `mcpServer.resources` URIs that collide with auto docs topic resources are rejected at schema validation time.

## [4.0.3] - 2026-06-24


## [4.0.2] - 2026-06-24


## [4.0.1] - 2026-06-24


## [4.0.0] - 2026-06-24

### Added

- **`Cli` class** — single runtime entry: eager `cliValidateProgram` + `Object.freeze(program)` in constructor; `run()`, `invoke()`, `serveMcp()`; lazy `cli.appConfig` getter (refreshed on dispatch); `exportCommandSchema()` and `exportAppConfigSchema()`.
- **`program.appConfig` + `CliAppConfig` / `CliAppConfigEntry`** — config-first model: flat JSON file, block `jsonSchema` (or all-string fallback), metadata overlay per key (`entries`), strict load (reject unknown keys), `ctx.appConfig` (`get`, `require`, `set`, `read`), built-in `config get`/`set`, zero-deps draft-07 subset validation.
- **`docs/config-schema.md`** — recommended TypeScript → JSON Schema codegen for `program.appConfig.jsonSchema` (parallel to output-schema guide).
- **`examples/consumer-app/`** — kitchen-sink copy template: all builtins, schemagen discovery, `outputSchema`, `from "argsbarg"`.
- **`mcp bundle` Claude Code plugin** — writes `dist/<key>-plugin/` (`.claude-plugin/plugin.json`, `.mcp.json`, `bin/<key>`, skills) alongside `dist/<key>.mcpb`.

### Changed

- **Breaking:** **`cliRun`, `cliInvoke`, `cliMcpServeStdio` removed** — use `new Cli(program).run()`, `.invoke(argv)`, `.serveMcp()` instead.
- **Breaking:** **`program.config` → `program.appConfig`**, **`schema` → `entries`**, **`CliConfig` → `CliAppConfig`**, **`ctx.config` → `ctx.appConfig`**.
- **Breaking:** **`program.env` + `CliEnvVarConfig` removed** — use `program.appConfig.entries`; root `configFile` → `appConfig.path`; nested env bag → flat schema keys; no extra file keys / `raw()`.
- **Breaking:** Handler config access — prefer `ctx.appConfig.get/require` over `process.env` for app config (env export remains for subprocesses).
- **`mcp bundle`** — stdout prints both `.mcpb` and plugin directory paths (one line each).
- **MCP config enforcement** — required keys from `program.appConfig` checked at `tools/call` (MCP) or before leaf dispatch (CLI).

### Removed

- **`mcpTool.requiresEnv`** — use `program.appConfig` schema entries with `env` instead.
- **`mcpServer.envFile`** — use `program.appConfig` + JSON config file instead.
- **`loadAppConfigEnv`, `ensureProgramEnv`** — replaced internally by `ensureAppConfig`, `exportConfigToEnv`.

## [3.6.4] - 2026-06-23

### Added

- **`docs/output-schema.md`** — recommended TypeScript → JSON Schema codegen for leaf `outputSchema`: `JSON payload` JSDoc discovery in `src/**/types.ts`, auto-generated `outputSchemas.ts` bridge, naming suffixes, JSDoc quality bar, narrowing, CI.

### Changed

- **`docs/README.md`**, **`cli-program.md`**, **`bundled-docs.md`**, Cursor rule template — cross-links to output-schema guide.

## [3.6.3] - 2026-06-23

### Added

- **`docs/README.md`** — documentation map (framework vs consumer docgen).
- **`docs/developing.md`** — maintainer workflow (`consumer-dev`, `consumers-sync`, npm `files`).
- **`examples/formats.ts`** — `CliValueFormat`, `default`, and `readLeafInputs()` demo.

### Changed

- **`cli-program.md`** — `CliLeafInputs` / `readLeafInputs()` semantics, upgrading to 3.6+, read-once-resolve-once cross-links.
- **`bundled-docs.md`** — framework docs vs consumer docgen.
- **`docs/mcp.md`** — varargs JSON array only (fixes stale comma-string guidance).
- **`consumers-dev` / `consumers-sync`** — refresh consumer `.cursor/rules/cli-program.mdc` from template via `scripts/merge-cli-program-rule.ts`.

## [3.6.2] - 2026-06-23

### Added

- **`cli-program.md`** — “Read flags once, resolve once” pattern for multi-surface leaves (`read*Flags` + `resolve*Input`).

## [3.6.1] - 2026-06-23

### Fixed

- **npm package** — `package.json` `files` whitelist so publish no longer ships `.cursor/`, `.private/`, `.github/`, or other dev-only paths (npm does not honor `.gitignore`).

## [3.6.0] - 2026-06-23

### Added

- **`CliValueFormat`** — optional `format` on string options: `duration`, `comma-list`, `date`, `date-time`; optional `default` and `pattern` (mutually exclusive with `format`).
- **`CliContext`** — `durationOpt`, `commaListOpt`, `dateOpt`, `dateTimeOpt`, and `readLeafInputs()` for schema-driven handler reads.
- **`formats` exports** — `parseDurationMs`, `parseCommaList`, `parseDate`, `parseDateTime` for reuse outside handlers.

### Changed

- **Post-parse validation** — applies option `default` values and validates `format` / `pattern` before handlers run.
- **MCP varargs** — `tools/call` positional arrays must be JSON arrays (comma-separated strings no longer accepted).
- **MCP comma-list options** — `format: comma-list` accepts string or array in `tools/call`.
- **`docs mcp`**, **`docs api`**, and **`docs/cli-program.md`** — document value formats and varargs policy.
- **Cursor rule template** (`docs/templates/cursor/rules/cli-program.mdc`) — thin tripwire that directs agents to read `node_modules/argsbarg/docs/cli-program.md` instead of duplicating authoring guidance.

## [3.5.0] - 2026-06-22

### Added

- **`install --mcp`** — OpenCode: merges local MCP entry into `~/.config/opencode` config (`mcp` key, OpenCode `type: "local"` format).
- **`install --mcp`** — Codex: runs `codex mcp add` when `codex` is on PATH.
- **`install --mcp`** — ChatGPT desktop: merges into `chatgpt_mcp_config.json` when ChatGPT app data exists.

### Changed

- **`docs mcp`** — Codex/ChatGPT guidance: Connectors for web (remote MCP); gated desktop JSON auto-install.

## [3.4.2] - 2026-06-22

### Added

- **`install --mcp`** — also merges into Claude Desktop `claude_desktop_config.json` when Claude Desktop app data is present (macOS, Windows, Linux paths).

### Changed

- **`docs mcp`** — generated guide documents Cursor, Claude Code, and Claude Desktop install targets and platform config paths.
- **`mcp bundle`** — no longer macOS-only; packs `.mcpb` on any platform when the compiled binary exists.

## [3.4.1] - 2026-06-22


## [3.4.0] - 2026-06-22

### Added

- **`hidden`** — boolean on commands and options; omitted from help listings, `docs schema` / `docs api`, shell completions, and MCP `tools/list`, but still parseable and invocable. Direct `-h` on a hidden command still works.
- **`mcp bundle`** — built-in subcommand when `mcpServer.enabled` (macOS-only v1). Runs `myapp mcp bundle` to pack `dist/<key>.mcpb` from `dist/<key>`. Bare `myapp mcp` still starts the stdio server.
- **`mcpServer.bundle`** — optional author, icon, and `longDescription` for MCP Bundle metadata.
- **Leaf `outputSchema`** — optional JSON Schema for structured stdout; exported in `docs schema`, `docs api`, skill `reference.md`, and MCP `tools/list` (stdout not validated at runtime yet). Legacy `mcpTool.outputSchema` still works.
- **MCP tool descriptions** — leaf `notes` are appended to `tools/list` descriptions (`{argsbarg:program}` resolved).

## [3.3.14] - 2026-06-21

### Changed

- **Generated notes** — deduplicated agent, docs, MCP, and completion help; each topic owns its guidance in one place.

## [3.3.13] - 2026-06-21

### Changed

- **Agent skills** — `SKILL.md` is a compact command index; `reference.md` holds the full `docs api` guide. `docs skill` notes recommend `install --skill` for the optimized persisted bundle.

## [3.3.12] - 2026-06-21

### Changed

- **Agent skills** — `SKILL.md` embeds the `docs api` command reference (body only) instead of a separate `## Commands` bullet catalog.

## [3.3.11] - 2026-06-21

### Added

- **Root help agent hint** — when `docs` is enabled, top-level `-h` includes a Notes line: `Agents: run \`myapp docs skill\` to learn how to use this app`. Root help also renders `program.notes`.

## [3.3.10] - 2026-06-21

### Changed

- **`install` help copy** — `--update` and `--quiet` option descriptions match behavior; `install --update` error message clarified.
- **`docs/install.md`** — quick-start and `--yes` flag docs aligned with install notes.

## [3.3.9] - 2026-06-21

### Changed

- **`install` notes** — `install --update` is under "Upgrade to latest release" (not "Refresh after upgrading"); shown only when `install.updateGetLatest` is set.

## [3.3.8] - 2026-06-21

### Changed

- **`install --update`** — downloads the latest release and reinstalls installed artifacts when `install.updateGetLatest` is set. Replaces the top-level `update` command and the old `--update` alias for `--reinstall`.

### Removed

- **`update` built-in** — use `myapp install --update` instead.

## [3.3.7] - 2026-06-21

### Changed

- **`docs mcp`** — intro copy is user-facing (`exposes an MCP server with features similar to the CLI`) instead of describing argsbarg internals.

## [3.3.6] - 2026-06-21

### Added

- **`install --skill`** — installed `SKILL.md` and `reference.md` include a `Generated by … install --skill` HTML comment (after SKILL.md frontmatter).

## [3.3.5] - 2026-06-21

### Changed

- **`notes` placeholders** — use `{argsbarg:program}` for the root program key in consumer `notes`. Built-in copy (e.g. `install` notes) interpolates the program key directly.

### Removed

- **`{app}` notes placeholder** — use `{argsbarg:program}` instead.

### Fixed

- **`docs schema` / `docs api` / MCP schema resource** — `{argsbarg:program}` in `notes` is resolved to the program key (same as help). Schema export uses the root program key for built-in subtrees on nested leaves.

## [3.3.4] - 2026-06-21


## [3.3.3] - 2026-06-21

### Added

- **`docs --save`** — write one docs subcommand to `./docs/`; argsbarg-generated markdown (`mcp`, `api`, `skill`) is prefixed with a `Generated by … docs … --save` HTML comment.

### Removed

- **`docs all`** — use individual subcommands (`docs readme`, `docs schema`, `docs api`, …) or `--save` per topic.

## [3.3.2] - 2026-06-21

### Changed

- **`install --uninstall`** — symmetric with install: requires `--all` or scoped flags; `--uninstall --all` removes everything argsbarg installed; empty scope succeeds without error.

## [3.3.1] - 2026-06-21

### Added

- **`docs/cli-program.md`** — authoring guide for `CliProgram` and leaves (MCP-free defaults); **headless-capable handlers** and **inline schema by default**.
- **`docs/templates/cursor/rules/cli-program.mdc`** — concise copy-paste Cursor rule for consumer apps.

### Removed

- **`mcpToolSchemaHints`** — redundant with MCP `inputSchema` option descriptions.
- **`wantsDryRun`** — use `ctx.hasFlag("dry-run")` instead.

## [3.3.0] - 2026-06-21

### Added

- **Headless helpers** — `shouldRunHeadless`, `shouldRunHeadlessWithPositionals`, `shouldRunHeadlessWithYes`, `wantsExplicitJson`, `requireYesInNonTty`, `formatDryRunMessage` for Ink/MCP CLIs.
- **`ghReleaseUpdateGetLatest`** — optional `install.updateGetLatest` factory for GitHub releases via `gh`.
- **`createGhVersionCheck`** — version-check cache, update notices, and background refresh helpers.

## [3.2.0] - 2026-06-20

### Added

- **`docs schema`** — print the full command tree as JSON (`myapp docs schema`). Replaces root `--schema` (requires `docs.enabled`).
- **`docs api`** — print the command tree as markdown (`myapp docs api`). Human-readable companion to `docs schema`.
- **`docs skill`** — print generated Cursor `SKILL.md` content to stdout (`myapp docs skill`).
- **`update` built-in** — when `install.updateGetLatest` is set, `myapp update` downloads the latest binary and reinstalls installed artifacts.
- **`install --reinstall`** — replaces `--update` (still accepted as a deprecated alias). Optional `--from <path>` for the binary source.

### Changed

- **Breaking:** root **`--schema`** removed — use **`docs schema`** when `docs.enabled` is `true`.
- **Breaking:** **`install --update`** renamed to **`install --reinstall`**.

## [3.1.0] - 2026-06-20

### Added

- **`docs` built-in** — opt in with `docs: { enabled: true, topics: { ... } }` on the program root. Bundled markdown topics on stdout (`myapp docs`, `myapp docs readme`, `myapp docs all`). Auto **`docs mcp`** guide when `docs` and `mcpServer` are both enabled. See [docs/bundled-docs.md](docs/bundled-docs.md).

### Changed

- **Agent skills** — `SKILL.md` is shell-only (removed MCP setup, `mcp.json`, and `tools/call` content). Use `docs mcp` or MCP tools for agent execution guidance.

## [3.0.0] - 2026-06-20

### Added

- **`version` built-in** — `myapp version` prints `CliProgram.version` (always available; reserved command name).

### Changed

- **`CliProgram.version`** (required) — single source of truth for the `version` built-in and MCP `serverInfo.version`. Removed `mcpServer.version` and automatic `package.json` lookup.
- **MCP opt-in** — `mcpServer: { enabled: true }` enables MCP; omit `mcpServer` to disable. Empty `mcpServer: {}` is rejected at validation.
- **MCP identity from `key`** — removed `mcpServer.name`. MCP `serverInfo.name`, schema URI, and `mcp.json` entry keys use `sanitizeToolSegment(root.key)` (e.g. `nested.ts` → `nested_ts://schema`). Shell `command` stays the raw `key`.

## [2.1.1] - 2026-06-20

### Changed

- **`install` built-in** — no longer gated on compiled binaries; available whenever `install.enabled !== false` (default on). Removed `isCompiledExecutable()` and `src/install/compiled.ts`.

## [2.1.0] - 2026-06-20


## [2.0.1] - 2026-06-20

### Removed

- **`CliContext.schema`** — use `ctx.program` (removed alias; `program` is the only field).

## [2.0.0] - 2026-06-20

### Changed (breaking)

- **`CliCommand` removed** — use `CliProgram` as the schema type passed to `cliRun` / `cliInvoke`. The runtime object shape is unchanged; only the type name and how you annotate it differ.

```typescript
// 1.x
import { type CliCommand } from "argsbarg";
const cli: CliCommand = { ... };
// 2.0
import { type CliProgram } from "argsbarg";
const cli = { ... } satisfies CliProgram;  // or : CliProgram
```

- **Internal type split** — `CliNode` / `CliLeaf` / `CliRouter` model the user command tree; `CliProgram` adds root-only `mcpServer` and `install`. These are not exported from the public API.
- **Capabilities resolver** — reserved built-in names (`completion`, `install`, `mcp`) are derived from program config and runtime (compiled binary), not from user-declared commands.

### Added

- **`ctx.program`** — alias for `ctx.schema` on `CliContext` (same `CliProgram` value).

## [1.5.0] - 2026-06-20

### Added

- **`install` built-in** (compiled binaries only) — install binary, bash/zsh/fish completions, Cursor/Claude skills, and MCP config (`install --all --yes`, `--update`, `--status`, `--uninstall`).
- **`completion fish`** — fish tab-completion script generation.
- Root **`install`** config (`{ enabled?: boolean, prefix?: string }`).

### Changed (breaking)

- **Removed `ai` command group** — no more `ai mcp` or `ai skill`.
- **Restored top-level `mcp`** — `myapp mcp` (reserved only when `mcpServer` is set).
- **Removed `aiSkill` config** — skill directory name defaults to sanitized root `key`; use `install --skill` instead of `ai skill`.

## [1.4.3] - 2026-06-19

### Added

- **`ai` built-in group** — `myapp ai skill cursor` and `myapp ai skill claude` install Agent Skills (`SKILL.md` + `reference.md`) to project or global skill directories.
- **`aiSkill`** root config to opt out of skill install (`{ enabled: false }`).

### Changed (breaking)

- **`myapp mcp`** → **`myapp ai mcp`**
- Reserved top-level command **`mcp`** → **`ai`** (user commands may now be named `mcp`)

## [1.4.2] - 2026-06-19

### Added

- **`fallbackCommand` / `fallbackMode` on any routing node** — nested routers can define default subcommand routing, not just the program root.
- **`ctx.positional(name)`** — named positional lookup; varargs return `string[]`, single slots return `string | undefined`.
- **MCP varargs coercion** — agents may pass `"a,b"` or `"a"` where `string[]` is expected.

### Fixed

- **Known options after varargs positionals** — `--flag` tokens after a varargs tail parse as options instead of being consumed as positional arguments.

## [1.4.1] - 2026-06-19

### Added

- **`ctx.invocation`** (`"cli"` or `"mcp"`) on `CliContext` for handler branching.
- **`cliInvoke`** and `CliInvokeResult` exported from the public API.
- **`CliOptionKind.Enum`** with `choices` — JSON Schema `enum`, shell completions, parse validation, help labels.
- **`mcpTool.description`** — per-leaf MCP tool description override.
- **`mcpTool.requiresEnv`** — env requirements in auto-generated descriptions; enforced at `tools/call` (empty string counts as absent).
- **`mcpServer.resources`** — pluggable `CliMcpResource` items in `resources/list` and `resources/read`.
- **`mcpServer.shellEnv`** — login-shell env captured at MCP server start; `PATH` always merged, other vars fill gaps in host env.
- **`mcpServer.envFile`** — `.env` file loaded into `process.env` after `shellEnv` (warns on stderr if missing).

## [1.4.0] - 2026-06-19

### Added

- **Opt-in MCP** — set `mcpServer: {}` on the program root to enable `myapp mcp`, a stdio MCP server (tools + `argsbarg://schema` resource). Hand-rolled JSON-RPC; zero new dependencies.
- **MCP tool descriptions** — `tools/list` descriptions include the CLI path (e.g. `stat owner lookup — Resolve owner info.`).
- **`mcpTool` leaf opt-out** — set `mcpTool: { enabled: false }` on a leaf to omit it from MCP tools while keeping it in the CLI and `--schema`.
- **MCP stderr on success** — successful tool calls return a second content block when the handler wrote to stderr.
- **MCP `structuredContent`** — when handler stdout is valid JSON, tool results include parsed `structuredContent` alongside text content.

### Fixed

- **Parent-scoped options before positionals** — nested commands accept flags from ancestor nodes when options appear before positional arguments (required for MCP tool argv layout).

## [1.3.1] - 2026-06-19

### Fixed

- **`--schema` discoverability** — list the flag in root help and offer it in shell completions at the program root (same pattern as `--help`).
- **Leaf root help** — show the reserved `completion` command in root help and `--schema` output (routing CLIs already did).

## [1.3.0] - 2026-06-18

### Added

- **`--schema`** — prints the full CLI tree as JSON to stdout (exit 0). Handlers are omitted; the injected `completion` subtree is excluded. Option name `schema` is reserved.

## [1.2.1] - 2026-06-18

### Changed

- **Trailing options** — when a leaf command has only bounded positionals (`argMax !== 0`), options may appear after positional arguments (e.g. `cmd ./file --verbose`). Commands with a varargs tail (`argMax: 0`) keep the previous behavior.
- **`examples/nested.ts`** — `stat` accepts `--json`; `stat owner lookup` prints JSON when the flag is set.

## [1.2.0] - 2026-04-24

### Added

- **`CliOption.required`** — makes an option required when parsing
- **`isInteractiveTty`** - a computed boolean of whether the app is running in an interactive tty
- **Single-command CLI support** - You can now define a `handler` directly on the root of your CLI configuration to quickly build single-command apps without nesting them in subcommands.

### Changed

- **`CliCommand` Strict Union** - (Breaking TS Change) `CliCommand` is now a Discriminated Union type. A command must be *either* a Router (with `commands`) or a Leaf (with `handler`), but not both. This catches structural mistakes at compile time.

## [1.1.1] - 2026-04-23

### Changed

- fix exports in package.json

## [1.1.0] - 2026-04-23

### Changed

- gen index.d.ts with `dts-bundle-generator` so that consumers don't typecheck the source files

## [1.0.1] - 2026-04-22

### Changed

- **`CliPositional`** — `argMin` and `argMax` are optional. When omitted, they behave as `argMin: 1` and `argMax: 1` (one required word). Set `argMax: 0` for an unbounded varargs tail.
- **Release** — `just release <major|minor|patch>` runs `just test` first, then `scripts/release.ts`, which no longer runs typecheck, lint, or tests itself. The release commit uses `git add -A` so all local changes in the repo are included, not only `package.json` and `CHANGELOG.md`.

## [1.0.0] - 2026-04-22

### Added

- `scripts/release.ts` — release automation (`just release <major|minor|patch>`): lint, typecheck, tests, semver bump, CHANGELOG promotion, commit, tag, push, GitHub release, npm publish.
- `CliPositional` type for entries in `CliCommand.positionals` (name, description, kind, argMin, argMax).
- `cliPositionalLabel()` for help-style labels of positional slots (exported alongside `cliOptionLabel()`).

### Changed

- **`CliCommand.children` → `CliCommand.commands`** — nested subcommands are declared under `commands` everywhere (schema, parser, validation, help, completion, runtime).
- **Development tasks** — former `package.json` scripts live in the repo `justfile` (e.g. `just test`, `just lint`). `package.json` no longer defines a `scripts` block.
- **Public barrel (`src/index.ts`)** — re-exports are limited to schema types and enums, `CliSchemaValidationError`, `CliContext`, `cliRun`, and `cliErrWithHelp`. Parsing (`parse`, `postParseValidate`, …), completion script helpers, help renderers, `cliValidateRoot`, and `utils` number helpers are no longer re-exported from the package entry (import from `src/*.ts` paths in this repo, or depend on internal modules if you fork).

### Removed

- **`createOption()`** — options and positionals are plain object literals; there is no factory helper.
- **`CliOptionDef`** — replaced by distinct types (see below).

### Breaking

- **`CliOption`** is only for named flags and value options (`options`). It no longer includes `positional`, `argMin`, or `argMax`. Use **`CliPositional`** on `positionals` for ordered arguments and varargs tails.
- **`CliCommand.positionals`** is now `CliPositional[]`, not `CliOption[]`.
- Migrate schemas: rename every `children` property to **`commands`**; move positional definitions to **`CliPositional`** objects on `positionals` and strip `positional` / `argMin` / `argMax` from flag definitions under `options` (flags only carry `name`, `description`, `kind`, and optional `shortName`).
- Imports: use `CliPositional` where needed; replace `CliOptionDef` with `CliOption` or `CliPositional` as appropriate.

[Unreleased]: https://github.com/bdombro/bun-argsbarg/compare/v5.1.15...HEAD
[5.1.15]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.15
[5.1.14]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.14
[5.1.13]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.13
[5.1.11]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.11
[5.1.10]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.10
[5.1.9]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.9
[5.1.8]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.8
[5.1.7]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.7
[5.1.6]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.6
[5.1.5]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.5
[5.1.4]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.4
[5.1.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.3
[5.1.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.2
[5.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.1
[5.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.1.0
[5.0.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.0.3
[5.0.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.0.2
[5.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.0.1
[5.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v5.0.0
[4.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.1.1
[4.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.1.0
[4.0.4]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.0.4
[4.0.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.0.3
[4.0.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.0.2
[4.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.0.1
[4.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v4.0.0
[3.6.4]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.6.4
[3.6.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.6.3
[3.6.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.6.2
[3.6.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.6.1
[3.6.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.6.0
[3.5.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.5.0
[3.4.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.4.2
[3.4.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.4.1
[3.4.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.4.0
[3.3.14]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.14
[3.3.13]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.13
[3.3.12]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.12
[3.3.11]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.11
[3.3.10]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.10
[3.3.9]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.9
[3.3.8]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.8
[3.3.7]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.7
[3.3.6]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.6
[3.3.5]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.5
[3.3.4]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.4
[3.3.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.3
[3.3.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.2
[3.3.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.1
[3.3.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.3.0
[3.2.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.2.0
[3.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.1.0
[3.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v3.0.0
[2.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.1.1
[2.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.1.0
[2.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.0.1
[2.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v2.0.0
[1.5.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.5.0
[1.4.3]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.3
[1.4.2]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.2
[1.4.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.1
[1.4.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.4.0
[1.3.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.3.1
[1.3.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.3.0
[1.2.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.2.1
[1.2.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.2.0
[1.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.1
[1.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.0
[1.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.1
[1.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.0
