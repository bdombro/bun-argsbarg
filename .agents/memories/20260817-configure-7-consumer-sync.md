# Made with /thread-memory

## Meta
updated: 2026-08-17 16:32
id: 00d87e4a-38ff-462e-b283-3185145d324c
thread: configure 7.0 consumer sync
scope: src/configure/**, src/runtime/capabilities.ts, src/config/validate.ts, src/cli-tool/post-create.ts, justfile, examples/**, CHANGELOG.md
topics: configure-7, consumer-migration, consumers-sync, file-bin-shim, schemagen, no-backward-compat
counts: 8 decision, 5 rejected, 3 footgun, 1 open

## 2026-08-17 14:00 decision
Configure 7.0 CLI surface (breaking)
context: Major configure refactor shipped as 7.0.0; consumers still used flag modes.
decision: Bare configure shows help. Subcommands: install, uninstall, status, get, set. Removed --refresh, --remove-all, --remove-config, --dry. --yes only on uninstall. Hooks renamed afterRefresh → afterInstall, beforeRemoveAll → beforeUninstall (no aliases). Homebrew formulae use caveats + just install-local/uninstall, not post_install hooks.
paths: src/configure/index.ts, src/builtins/configure.ts, docs/configure.md, CHANGELOG.md

## 2026-08-17 14:30 decision
Consumer migration pattern (sqsp-*)
context: just consumers-sync failed on configure --remove-all after argsbarg@7.0.0 publish.
decision: Migrate each consumer: justfile configure install/uninstall --yes; program.ts afterInstall/beforeUninstall; formula-shared.ts and Formula/*.rb caveats; drop uninstall-config recipe (--remove-config gone). sqsp-workspaces and sqsp-i18n-tools-poc completed sync; sqsp-qa needed SQSP_QA_EMAIL env on email appConfig entry for non-interactive install.
paths: justfile, examples/full-example/justfile, examples/full-example-json/justfile

## 2026-08-17 15:00 rejected
Framework backward compat for old configure flags
rejected: Keeping --refresh/--remove-all aliases or softening 7.0 rules so unmigrated consumers keep working.
instead: Upgrade consumer justfiles, hooks, and formulas; no compat shims in argsbarg.

## 2026-08-17 15:00 rejected
Bun workspace:* for in-repo examples
rejected: Root package.json workspaces with argsbarg: workspace:* in example templates.
instead: Bun cannot resolve workspace dep on the root package (Workspace dependency "argsbarg" not found). Keep file:../.. in templates; ln -sf ../argsbarg/bin/argsbarg in just setup and consumers-dev.

## 2026-08-17 15:00 rejected
Dedicated patch-argsbarg-bin.ts script
rejected: Shipped scripts/patch-argsbarg-bin.ts for file: bin shim fix.
instead: One-line shell in justfiles: test -f node_modules/argsbarg/bin/argsbarg && ln -sf ../argsbarg/bin/argsbarg node_modules/.bin/argsbarg

## 2026-08-17 15:00 rejected
full-example-json scripts/schemagen.ts workaround
rejected: bun scripts/schemagen.ts importing argsbarg/schemagen in json template.
instead: argsbarg schemagen via justfile; file: bin shim fix for local dev.

## 2026-08-17 15:00 rejected
Non-TTY configure install warn-only
rejected: runInstallWizard exiting 0 with stderr warning when required appConfig missing in non-TTY (automation soften).
instead: Reverted; strict exit(1) remains. Consumers supply env mappings (e.g. SQSP_QA_EMAIL) or run configure install in TTY.

## 2026-08-17 15:30 decision
Configure lifecycle skips appConfig gate
context: configure uninstall failed with "missing email" before handler ran on sqsp-qa@7.0.0.
decision: skipsRequiredAppConfigExit includes configure install, uninstall, status, and bare configure help — not backward compat; required so new subcommand handlers are reachable. Shipped 7.0.1.
paths: src/runtime/capabilities.ts, src/docs/docs.test.ts, CHANGELOG.md

## 2026-08-17 15:45 decision
Partial validate empty definitions footgun fix
context: sqsp-qa configure install wizard crashed with Duplicate schema URI "https://github.com/cfworker" when saving config; schemagen emits definitions: {}.
decision: attachRootCompanionSchemas skips empty definitions and $defs objects before validator.addSchema. Shipped 7.0.3.
paths: src/config/validate.ts, src/config/validate.test.ts, CHANGELOG.md

## 2026-08-17 15:30 decision
post-create json schemagen PATH
context: argsbarg create --template json failed schemagen when global ~/.bun/bin/argsbarg pointed at wrong target.
decision: post-create schemagen prepends target project's node_modules/.bin to PATH.
paths: src/cli-tool/post-create.ts, CHANGELOG.md

## 2026-08-17 15:30 decision
In-repo example just setup bin shim
context: Bun file:../.. links .bin/argsbarg to src/index.ts instead of bin/argsbarg.
decision: examples/full-example and full-example-json just setup run ln -sf after bun install. consumers-dev runs same via node_modules/argsbarg path after bun add file:.
paths: examples/full-example/justfile, examples/full-example-json/justfile, justfile, docs/developing.md

## 2026-08-17 16:00 footgun
consumers-sync triple build/docgen
fails: consumers-sync runs just build && just docgen && just install-local; install-local depends on build which depends on docgen — three schemagen/docgen passes per consumer. Looks like a hang during third schemagen.
paths: justfile

## 2026-08-17 16:00 footgun
sqsp-i18n configure install blocks on TTY
fails: install-local ends with sqsp-i18n configure install; with TTY and no GH_TOKEN/gh auth, wizard waits for githubToken input (no echo). Set GH_TOKEN or gh auth login before sync.
paths: src/program.ts in sqsp-i18n-tools-poc

## 2026-08-17 16:00 footgun
Duplicate schema URI on partial config validate
fails: Any appConfig jsonSchema with empty definitions: {} from schemagen throws on validateConfigDocumentPartial until argsbarg 7.0.3.
paths: src/config/validate.ts

## 2026-08-17 16:10 open
Publish 7.0.3 and finish consumers-sync
open: argsbarg 7.0.3 has validate fix; consumers migrated on disk but need bun add ^7.0.3 and just consumers-sync after publish. Consider trimming consumers-sync to merge + install-local only (drops redundant build/docgen).
paths: package.json, CHANGELOG.md, justfile
