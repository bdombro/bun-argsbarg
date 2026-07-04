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

Private GitHub release downloads require `HOMEBREW_GITHUB_API_TOKEN` on `brew install` and `brew upgrade`.

If [GitHub CLI](https://cli.github.com/) is installed:

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
HOMEBREW_GITHUB_API_TOKEN="$(gh auth token)" brew install bdombro/bun-argsbarg/full-example
full-example configure
```

Without `gh`, create a personal access token at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

- Resource owner — your org
- Repository access — this repo (or all repositories)
- Permissions — **Contents** (read-only)

```bash
HOMEBREW_GITHUB_API_TOKEN=YOUR_TOKEN brew install bdombro/bun-argsbarg/full-example
```

Upgrade:

```bash
HOMEBREW_GITHUB_API_TOKEN="$(gh auth token)" brew upgrade full-example
```

Shell completions install during `brew install`. See [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

### Developers

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh). From the repository root (this directory — the folder with `justfile` and `Formula/`):

```bash
brew install just bun
just setup
just install              # build + local dev formula
just reinstall-local      # fast binary swap during development
just install-production   # remote tap install (uses gh auth token)
just test-release
```

Undo a local dev install: `just uninstall` (formula + agent artifacts), `just uninstall-config` (app config only).

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
