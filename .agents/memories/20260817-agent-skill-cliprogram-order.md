# Made with /thread-memory

## Meta
updated: 2026-08-17 16:46
id: f34a1c20-e888-4ab1-947e-53e6d1b1bc6d
scope: src/skill/**, src/configure/**, src/core/types.ts, index.d.ts, examples/**, docs/ai-skills.md, docs/configure.md, docs/cli-program.md, README.md, CHANGELOG.md
topics: agent-skill, agents-protocol, skill-enabled, configure-install, cliprogram-field-order, consumer-program-ts
counts: 3 decision, 3 rejected, 1 footgun

## 2026-08-17 16:46 decision
Single agent skill install via program.skill
context: Per-host skill targets (cursorSkill, claudeSkill, etc.) duplicated install paths and configure complexity.
decision: Opt in with program.skill.enabled === true (default off when omitted). cliSkillInstall writes ~/.agents/skills/<skillDirName(key)>/ where skillDirName replaces /, \, and spaces with _. Bundle includes skill.md (protocol) plus SKILL.md compatibility copy and reference.md. configure install (all plan) installs skill when enabled; configure uninstall removes the directory. Echo Skill installed to ~/.agents/skills/<key>/ on install.
paths: src/skill/install.ts, src/skill/naming.ts, src/skill/generate.ts, src/configure/artifacts/target-skill.ts, src/configure/artifacts/targets/skill.ts, docs/ai-skills.md

## 2026-08-17 16:46 decision
Removed legacy configure skill and per-host MCP targets
context: configure.agentIntegration and configure.targets.*Skill / *Mcp keys mixed program-level gates with vendor-specific install.
decision: validate.ts rejects configure.agentIntegration and legacy per-host skill target keys. Skill gate is program.skill only; MCP gate is program.mcpServer.enabled writing ~/.agents/mcp.json (agentsMcp artifact). No vendor MCP auto-install (Cursor, Claude Desktop, Codex, etc.). Interactive configure does not prompt Y/n for skill — install/uninstall follows program.skill.enabled on configure install/uninstall.
paths: src/core/validate.ts, src/configure/artifacts/target-effective.ts, src/core/types.ts, CHANGELOG.md

## 2026-08-17 16:46 decision
CliProgram root fields alphabetical order
context: program.ts objects drifted (key/version first); type definition order did not match consumer examples.
decision: CliProgram extension fields in src/core/types.ts and index.d.ts are alphabetical: appConfig, completion, configure, docs, hooks, httpServer, log, mcpServer, readiness, skill, version. Program objects use the same convention for all present keys (e.g. commands, description, docs, hooks, httpServer, key, mcpServer, readiness, skill, version). Documented in docs/cli-program.md. Applied to examples/, src/cli-tool/program.ts, and consumer program.ts (sqsp-workspaces, sqsp-qa-manager-poc, sqsp-i18n-tools-poc).
paths: src/core/types.ts, index.d.ts, examples/full-example/src/program.ts, examples/minimal.ts, examples/nested.ts, examples/servers.ts, examples/formats.ts, examples/mcp-test.ts, examples/option-required.ts, src/cli-tool/program.ts, docs/cli-program.md, README.md

## 2026-08-17 16:46 rejected
Per-host skill install targets
rejected: cursorSkill, claudeSkill, codexSkill, opencodeSkill, openclawSkill configure.targets keys and paired MCP skill paths.
instead: Single ~/.agents/skills/<key>/ target gated by program.skill.enabled.

## 2026-08-17 16:46 rejected
configure.agentIntegration
rejected: Install-time switch choosing MCP vs skill defaults per host category.
instead: program.skill.enabled and program.mcpServer.enabled on the program root.

## 2026-08-17 16:46 rejected
skillInstallEnabled helper wrapper
rejected: Dedicated skillInstallEnabled() indirection around program.skill?.enabled checks.
instead: Inline program.skill?.enabled === true at call sites.

## 2026-08-17 16:46 footgun
Consumer docgen after argsbarg bump with skill.enabled
fails: Adding skill.enabled to a consumer program.ts updates dist/ on build but docs/skill.md path text may stay stale until just docgen runs in that consumer after argsbarg version bump.
paths: examples/full-example/justfile, docs/ai-skills.md
