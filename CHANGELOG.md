# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/bdombro/bun-argsbarg/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.3.1
[1.3.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.3.0
[1.2.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.2.1
[1.2.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.2.0
[1.1.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.1
[1.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.0
[1.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.1
[1.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.0
