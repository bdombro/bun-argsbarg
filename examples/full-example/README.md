# full-example

Argsbarg copy template / reference app (not a kitchen-sink product).

## What's in this app

- **Builtins enabled:** CLI, shell completion, `docs`, MCP, HTTP API, `configure` (wizard available; no default `appConfig` in the template)
- **Commands:**
  - `echo` — simple flags/positionals
  - `render-json` — `kind: "json"` leaf, schemagen `inputSchema`, `ctx.inputsAs`
  - `status` — schemagen `outputSchema`, `--json`
  - `workspaces` — REST CRUD, `:id` param routers, verb leaves, schemagen input schemas
- **Tooling:** `@sg` schemagen, `just docgen`, Homebrew/just dev workflow

## Quick start

From a git checkout at this directory (requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh)):

```bash
brew install just bun
just setup
just schemagen   # after changing @sg types in src/
just run status --json
just run docs readme
```

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

Undo a local dev install: `just uninstall` (formula + agent artifacts), `just uninstall-config` (app config only, without uninstalling the formula).

## Schemagen (`@sg`)

Mark schema-facing types with `/** @sg */` immediately above the declaration (no blank line). Run `argsbarg schemagen` (via `just schemagen` or `just setup`).

| Type | Generated artifact | Import |
| --- | --- | --- |
| `RenderJsonInput` | `RenderJsonInputSchema.json` | `RenderJsonInputSchema` from `./__generated__` |
| `StatusJsonOutput` | `StatusJsonOutputSchema.json` | `StatusJsonOutputSchema` from `./__generated__` |
| `WorkspaceNameInput` | `WorkspaceNameInputSchema.json` | `WorkspaceNameInputSchema` from `./__generated__` |

## Consumer docs

Regenerate committed reference docs under `docs/` (see [docs/README.md](docs/README.md)):

```bash
just docgen
```
