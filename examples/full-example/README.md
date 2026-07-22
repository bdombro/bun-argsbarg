# full-example

Argsbarg full example reference app

## Quick start

From a git checkout at this directory (requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh)):

```bash
brew install just bun
just setup
just schemagen   # after changing src/**/schema.ts
just run status --json
just run docs readme
```

Run `full-example configure` when the app needs secrets or other app config (interactive wizard).

## Install

Requires [Homebrew](https://brew.sh).

### End users

Private GitHub release downloads require [GitHub CLI](https://cli.github.com/) authentication. Run once before `brew install` or `brew upgrade`:

```bash
brew install gh   # skip if already installed
gh auth login     # skip if already authenticated
```

Install:

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install bdombro/bun-argsbarg/full-example
full-example configure
```

Upgrade:

```bash
brew upgrade full-example
```

Shell completions install during `brew install`. See [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

### Developers

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh). From the repository root (this directory — the folder with `justfile` and `Formula/`):

```bash
brew install just bun
just setup
just install              # build + local dev formula
just reinstall-local      # fast binary swap during development
just install-production   # remote tap install (requires gh auth login)
just test-release
```

Undo a local dev install: `just uninstall` (formula + agent artifacts; app config removed by formula `uninstall`), `just uninstall-config` (app config only, without uninstalling the formula).

## Schemagen roots

| Export in `schema.ts` | Generated artifact | Import on leaf / program |
| --- | --- | --- |
| `export type configType = …` | `__generated__/configSchema.json` | `{ configSchema }` from `config/__generated__/index.ts` → `program.appConfig.jsonSchema` |
| `export type outputType = …` | `__generated__/outputSchema.json` | `{ outputSchema }` from `__generated__/index.ts` → `leaf.outputSchema` |
| `export type inputType = …` | `__generated__/inputSchema.json` | `{ inputSchema }` from `__generated__/index.ts` → `leaf.inputSchema` |

Discovery walks `src/**/schema.ts` only. Domain helpers stay in sibling `types.ts`. `__generated__/` is gitignored — run `argsbarg schemagen` (via `just schemagen` or `just setup`).

## Consumer docs

Regenerate committed reference docs under `docs/` (see [docs/README.md](docs/README.md)):

```bash
just docgen
```

## Environment

Optional overrides for `program.appConfig` (the configure wizard is the usual path):

| Variable | Purpose |
| --- | --- |
| `FULL_EXAMPLE_API_TOKEN` | Overrides `apiToken` when set in the shell |
