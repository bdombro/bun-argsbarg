# Developing argsbarg

Notes for maintainers of this repository. Also shipped under `node_modules/argsbarg/docs/` for fork maintainers.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [just](https://github.com/casey/just) — `just` lists recipes
- `gh` and `npm` logged in for release

## Day-to-day

```bash
just check    # typecheck + format
just test     # check + unit tests
just typegen  # regenerate index.d.ts
```

## Release

```bash
just release patch   # or minor | major
```

The release script bumps `package.json`, promotes `[Unreleased]` in `CHANGELOG.md`, commits, tags, pushes, creates a GitHub release, and publishes to npm. Run `just test` first (the `just release` recipe does).

Update `CHANGELOG.md` under `[Unreleased]` before releasing.

## Local consumer apps

Sibling repos under `../../ss/` (paths are machine-specific; adjust in `justfile` if needed):

| Recipe | When | Effect |
| --- | --- | --- |
| `just consumer-dev` | Before publish; hacking on argsbarg locally | `bun add argsbarg@file:<relative>` in each consumer |
| `just consumers-sync` | After release | Sets `"argsbarg": "^<this package.json version>"`, `bun install`, `just build`, `just docgen`, `just install` |

`consumers-sync` reads the version from **this repo’s** `package.json` — not npm. Run it **after** `just release` so consumers pin a version that exists on the registry.

Re-copy `docs/templates/cursor/rules/cli-program.mdc` into consumer repos when the template changes (append app-specific conventions; do not fork the whole guide).

## npm package contents

`npm publish` does **not** honor `.gitignore`. Only paths listed in `package.json` `files` are included in the tarball (plus always-excluded defaults like `node_modules`).

When adding docs or examples intended for consumers, ensure they live under whitelisted paths (`docs/`, `examples/`, `src/`, etc.).

## Docs

See [README.md](README.md) for the documentation map. Framework authoring guide: [cli-program.md](cli-program.md).
