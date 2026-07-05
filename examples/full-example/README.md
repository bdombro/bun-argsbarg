# full-example

Argsbarg full example reference app

## Quick start

From a git checkout at this directory (requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh)):

```bash
brew install just bun
just setup
just schemagen   # after changing src/**/types.ts
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

## Schemagen markers

| Marker in interface JSDoc | Artifact |
| --- | --- |
| `Config schema` | `schemas/configSchemas.ts` + `schemas/generated/*-config.json` |
| `JSON payload` | `schemas/outputSchemas.ts` + `schemas/generated/*.json` |

Discovery walks `src/**/types.ts` only.

## Environment

Optional overrides for `program.appConfig` (the configure wizard is the usual path):

| Variable | Purpose |
| --- | --- |
| `FULL_EXAMPLE_API_TOKEN` | Overrides `apiToken` when set in the shell |
