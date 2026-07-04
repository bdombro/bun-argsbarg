# https://github.com/casey/just — run `just` to list recipes.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# List available recipes (default)
_:
    @just --list

# Typecheck and format the codebase
check: typecheck format

consumer_apps := "idp-trees sqsp-qa-manager-poc sqsp-i18n-tools-poc"

# Verify committed schemas match schemagen output and template drift in examples/full-example
check-full-example: full-example-schemagen
    #!/usr/bin/env bash
    cd examples/full-example
    git diff --exit-code schemas/ || {
      echo "examples/full-example/schemas/ is out of date — run: just full-example-schemagen"
      exit 1
    }
    cd "{{justfile_directory()}}"
    bun ./src/cli-tool/main.ts create --check examples/full-example

# Smoke-test argsbarg create into a temp directory
create-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "$tmpdir"' EXIT
    root="{{justfile_directory()}}"
    bun "$root/src/cli-tool/main.ts" create "$tmpdir/smoke-cli" \
      --key smoke-cli --release-repo example/smoke-cli --yes
    test -d "$tmpdir/smoke-cli/.git"
    git -C "$tmpdir/smoke-cli" log -1 --oneline | grep -q Initial

# Install deps for examples/full-example
full-example-install:
    cd examples/full-example && just setup

# Regenerate JSON Schema artifacts in examples/full-example
full-example-schemagen:
    cd examples/full-example && just schemagen

# Point local consumer apps at this repo (file: dep) for pre-publish development
consumers-dev:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    ss="$root/../../ss"
    template="${root}/examples/full-example/.cursor/rules/cli-program.mdc"
    echo "argsbarg@file:<relative-to-consumer> → ${root}"
    for app in {{consumer_apps}}; do
      dir="$(cd "$ss/$app" && pwd)"
      rel="$(bun -e "console.log(require('node:path').relative(process.argv[1], process.argv[2]))" "$dir" "$root")"
      echo "==> $app ($dir) → file:${rel}"
      (cd "$dir" && bun add "argsbarg@file:${rel}" && bun "${root}/scripts/merge-cli-program-rule.ts" "$dir" "$template")
    done

# Pin consumers to ^<this repo version>, install, merge Cursor rule, build, docgen
consumers-sync:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    ss="$root/../../ss"
    latest="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('${root}/package.json','utf8')).version)")"
    echo "argsbarg@^${latest}"
    for app in {{consumer_apps}}; do
      dir="$(cd "$ss/$app" && pwd)"
      echo "==> $app ($dir)"
      (cd "$dir" && bun add "argsbarg@^${latest}" && bun "${root}/scripts/merge-cli-program-rule.ts" "$dir")
    done

# Run the minimal example once
example *ARGS:
    bun ./examples/minimal.ts {{ARGS}}

# Run the minimal example and watch for changes
example-watch *ARGS:
    bun --watch ./examples/minimal.ts {{ARGS}}

# Format and lint the codebase (auto-fix)
format:
    bun run biome check ./src ./scripts --write

# Lint the codebase without writing
lint:
    bun run biome check ./src ./scripts

# Bump version, test, typegen, tag, and publish to GitHub + npm
release bump: test typegen
    bun scripts/release.ts {{bump}}

# Typecheck, lint, then run the test suite
test: check
    bun test

# Generate package type declarations (index.d.ts)
typegen:
    bunx dts-bundle-generator --out-file index.d.ts src/index.ts

# Typecheck without emitting build artifacts
typecheck:
    bun run tsc --noEmit

alias fmt := format
