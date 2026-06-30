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
| `just consumers-dev` | Before publish; hacking on argsbarg locally | `bun add argsbarg@file:<relative>`; refresh `.cursor/rules/cli-program.mdc` from template (keeps app-specific suffix) |
| `just consumers-sync` | After release | Sets `"argsbarg": "^<this package.json version>"`, `bun install`, merge **argsbarg Cursor rule**, `just build`, `just docgen`, `just install` (consumer app binary, completions, and **app** skill) |

`consumers-sync` reads the version from **this repo’s** `package.json` — not npm. Run it **after** `just release` so consumers pin a version that exists on the registry.

**Argsbarg authoring rule** — `scripts/merge-cli-program-rule.ts` copies `docs/templates/cursor/rules/cli-program.mdc` into each consumer’s `.cursor/rules/cli-program.mdc`, preserving any existing `**… conventions:**` footer block.

**Recommended in each consumer:** replace the template placeholder with `**<app> conventions:**` bullets (paths to `read*Flags`, shared flags, Ink vs JSON-only). Commit that file; merges refresh the shared top, not your footer.

**Consumer app skill** — `just install` in each consumer (part of `consumers-sync`) runs `myapp install --skill`, which updates `~/.cursor/skills/<app>/` from that app’s schema — not the argsbarg framework rule.

## npm package contents

`npm publish` does **not** honor `.gitignore`. Only paths listed in `package.json` `files` are included in the tarball (plus always-excluded defaults like `node_modules`).

When adding docs or examples intended for consumers, ensure they live under whitelisted paths (`docs/`, `examples/`, `src/`, etc.).

Exclude `examples/consumer-app/node_modules/` from the npm tarball via [`.npmignore`](../.npmignore).

## Kitchen-sink example

[`examples/consumer-app/`](../examples/consumer-app/) must enable every builtin (`capabilities.test.ts`). After builtin or schemagen doc changes:

```bash
just consumer-app-schemagen
just test
```

See [`.cursor/rules/examples.mdc`](../.cursor/rules/examples.mdc) for maintainer guidance.

## Docs

See [README.md](README.md) for the documentation map. Framework authoring guide: [cli-program.md](cli-program.md).
