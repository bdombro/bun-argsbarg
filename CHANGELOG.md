# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-04-23


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

[Unreleased]: https://github.com/bdombro/bun-argsbarg/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.1.0
[1.0.1]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.1
[1.0.0]: https://github.com/bdombro/bun-argsbarg/releases/tag/v1.0.0
