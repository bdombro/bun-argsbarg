# Made with /thread-memory

## Meta
updated: 2026-08-17 16:34
id: f0253b90-1e08-40f4-8c88-b6de8fc55e33
scope: src/cli-tool/**, examples/full-example/**, examples/full-example-json/**, justfile, docs/**, CHANGELOG.md, .cursor/skills/echo-command/**
topics: create-templates, template-picker, consumers-sync, skill-enabled, echo-skill
counts: 5 decision, 3 footgun

## 2026-08-17 16:00 decision
Two create copy templates (cli default, json schema-first)
context: Single full-example template mixed CLI shell with schemagen/CRUD; new apps need a simpler default.
decision: Split into examples/full-example (cli template, default --template cli: builtins, echo, status, no schemagen) and examples/full-example-json (json template: @sg, schemas, render-json, workspaces CRUD, in-memory SQLite). argsbarg create adds --template cli|json, CREATE_TEMPLATES registry, create-identity.template for --check drift, A/B interactive picker when TTY and no --template. post-create schemagen only for json. just example-full-check validates both templates. examples/minimal.ts stays a non-template learning path.
paths: src/cli-tool/create.ts, src/cli-tool/prompt.ts, src/cli-tool/run-create.ts, src/cli-tool/post-create.ts, examples/full-example/, examples/full-example-json/, justfile, CHANGELOG.md

## 2026-08-17 16:10 decision
create --check templateId only when --template on argv
context: create --check on full-example-json failed because handler always passed templateId cli (normalizeCreateTemplateId(undefined) → cli).
decision: program.ts create handler passes templateId only when --template appears on argv; devTemplateIdForDir resolves template from target path for --check.
paths: src/cli-tool/program.ts, src/cli-tool/create.ts

## 2026-08-17 16:15 decision
Biome noNonNullAssertion in promptTemplateChoice
context: just lint warned on CREATE_TEMPLATES[0]! and [1]!.
decision: Use CREATE_TEMPLATES.find by id with guard throw instead of non-null assertions.
paths: src/cli-tool/prompt.ts

## 2026-08-17 16:25 decision
Echo command project skill
context: User requested /create-skill for full-example echo leaf usage.
decision: Added .cursor/skills/echo-command/SKILL.md covering CLI (--message), MCP return-vs-print handler pattern, and paths to examples/full-example/src/commands/echo/command.ts.
paths: .cursor/skills/echo-command/SKILL.md

## 2026-08-17 16:30 footgun
Skill install needs skill.enabled in the Cellar binary at post_install
fails: configure --sync during brew post_install installs ~/.agents/skills/<key>/ only when program.skill.enabled is true in the compiled binary on PATH. Editing program.ts after just build updates dist/ but not Homebrew Cellar until install-local or install-local-reinstall. just sync-artifacts runs bun ./src/index.tsx (source program.ts) and can sync without reinstalling Cellar.
paths: src/configure/index.ts, examples/full-example-json/scripts/formula-shared.ts

## 2026-08-17 16:30 footgun
consumers-sync timing vs program.ts edits
fails: consumers-sync runs just build then just install-local once per consumer. If skill.enabled (or any program field affecting configure install) is added to disk after that build/install window, post_install already ran without it. Re-run consumers-sync after the edit, or just sync-artifacts in the consumer, or install-local again.
paths: justfile

## 2026-08-17 16:30 footgun
build reads disk at build time, not git HEAD
fails: just build compiles whatever is on disk when invoked; uncommitted program.ts changes are included if present before build. Confusion when file is edited after the sync build/install cycle, not when git HEAD lacks the field.
paths: justfile
