# example-homebrew

Argsbarg Homebrew CLI template (Bun-compiled binary, formula, tap).

This is the minimal Homebrew path: `bun build --compile` produces one binary, a formula in this repo's tap installs it with shell completions, and `scripts/release.ts` publishes GitHub releases. For an npm/npx CLI, use the `cli` template instead.

## Installation

```bash
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install example-homebrew
```

Homebrew installs shell completions (`generate_completions_from_executable`). Upgrade with `brew upgrade example-homebrew`.

## Commands

- `example-homebrew echo` — Echo text back to stdout or inspect flags.
- `example-homebrew status` — Show application version with optional `--json`.
- Built-ins: `completion`, `version`.

## Development

Requires [Homebrew](https://brew.sh), [just](https://just.systems), and [Bun](https://bun.sh):

```bash
brew install just bun
just setup
just test
just install-local   # build, stage a dev formula, brew install
```

`just release <major|minor|patch>` bumps the version, compiles, uploads the release zip, and updates `Formula/example-homebrew.rb`. It asks for confirmation; `--dry-run` prints the plan without changing anything.

The formula class, homepage, and tap come from `src/create-identity.ts` (`key`, `releaseRepo`) via `scripts/formula-shared.ts`; edit them there. See [docs/distribution.md](docs/distribution.md) for public vs private taps, local testing, and the release steps.
