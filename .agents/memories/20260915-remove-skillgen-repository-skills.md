# Made with /thread-memory

## Meta
updated: 2026-09-15 21:05
id: 5b5b3224-194c-4f2f-806a-91d4c9af60f0
scope: src/**, docs/**, examples/**, scripts/merge-agents-md.ts, justfile, CHANGELOG.md
topics: skill-removal, repository-skills, dotagents, consumer-agents-md, configure-install, consumers-sync
counts: 4 decision, 2 rejected, 1 footgun

## 2026-09-15 21:05 decision
Complete removal of skill generation from argsbarg runtime and tooling
context: User explicitly requested removing all skill generation features from argsbarg runtime and consumer workflows instead of having the framework generate agent skills.
decision: Removed docs skill and docs skill --save built-ins. Removed generateSkillBundle from src/skill/generate.ts (retained generatePluginSkillBundle for MCP plugin support). Removed skill generation and installation from configure install (retained legacy ~/.agents/skills/<key>/ cleanup in configure uninstall). Deprecated CliSkillConfig and program.skill.
paths: src/docs/builtin.ts, src/docs/resolve.ts, src/docs/save.ts, src/skill/generate.ts, src/skill/install.ts, src/skill/hint.ts, src/configure/artifacts/target-skill.ts, src/configure/artifacts/targets/skill.ts, src/configure/artifacts/target-effective.ts, src/core/types.ts, src/builtins/presentation.ts, src/builtins/configure-copy.ts, CHANGELOG.md, docs/ai-skills.md, docs/bundled-docs.md, docs/configure.md

## 2026-09-15 21:05 decision
Hand-authored repository skills per dotagents protocol
context: LLM agents should discover commands and options on demand via standard CLI patterns rather than relying on massive generated API reference dumps in LLM context.
decision: Skills follow the dotagents protocol (skills/<app>/SKILL.md). In argsbarg create, starter templates include an intent-based router skills/<tmpl.key>/SKILL.md mapped to skills/<opts.key>/SKILL.md on creation. just docgen updates ./docs/ only and never overwrites skills/.
paths: src/cli-tool/create.ts, examples/full-example/skills/full-example/SKILL.md, examples/full-example-json/skills/full-example-json/SKILL.md, docs/ai-skills.md

## 2026-09-15 21:05 decision
Consumer AGENTS.md guides app authors, not CLI consumers
context: Managed section in {consumer}/AGENTS.md previously instructed agents to run <cli> <subcommand> --help and configure install to persist skills, conflating CLI consumers with developers authoring the application.
decision: In scripts/merge-agents-md.ts, {consumer}/AGENTS.md is strictly for developers and coding agents writing TypeScript code. Replaced CLI consumer instructions with guidance for authors: when adding, renaming, or removing commands, update skills/<key>/SKILL.md so the intent-based router stays accurate. Separated skills/<key>/SKILL.md from docgen in the Documentation section.
paths: scripts/merge-agents-md.ts, examples/full-example/AGENTS.md, examples/full-example-json/AGENTS.md

## 2026-09-15 21:05 decision
Consumer migration and gws-docs-edit removal from consumers-sync
context: Need to migrate all active consumers (sqsp-workspaces, sqsp-qa-manager-poc, sqsp-i18n-tools-poc, gws-docs-edit) to match the new repository skills and docs structure.
decision: In sqsp-workspaces, sqsp-qa-manager-poc, and sqsp-i18n-tools-poc: removed docs skill --save from justfile docgen, deleted obsolete docs/skill.md, scaffolded skills/<app>/SKILL.md, and ran scripts/merge-agents-md.ts. Removed gws-docs-edit from consumer_apps in the root justfile because it is an agent skill repo itself rather than a compiled CLI application.
paths: justfile, scripts/merge-agents-md.ts

## 2026-09-15 21:05 rejected
Preserving docs skill CLI subcommand as an alias
rejected: Keeping docs skill or docs skill --save for backward compatibility with older scripts or habits.
instead: Completely stripped from CLI parser, docs built-ins, and help texts.

## 2026-09-15 21:05 rejected
Automated skill generation during just docgen
rejected: Running an automated generator to produce or overwrite skills/<app>/SKILL.md during just docgen.
instead: Skills are living intent-based routers hand-crafted and maintained by human or AI authors as commands evolve.

## 2026-09-15 21:05 footgun
Consumers-sync install-local requires required appConfig environment variables
fails: Running configure install non-interactively fails if required appConfig options lack default values or environment variable fallbacks (e.g. SQSP_QA_EMAIL required for sqsp-qa-manager-poc).
paths: src/configure/wizard.ts
