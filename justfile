# https://github.com/casey/just — run `just` to list recipes.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# List available recipes (default)
_:
    @just --list

# Typecheck and format the codebase
check: format typecheck

consumer_apps := "~/dev/ss/sqsp-workspaces ~/dev/ss/sqsp-qa-manager-poc ~/dev/ss/sqsp-i18n-tools-poc ~/dev/ss/pdf-gen"

# Verify full-example schemagen runs and template drift
check-full-example: full-example-schemagen
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
    bun ./src/cli-tool/main.ts schemagen --root examples/full-example

# Run schemagen in each local consumer app (paths must exist)
consumers-schemagen:
    #!/usr/bin/env bash
    set -euo pipefail
    root="$(cd "{{justfile_directory()}}" && pwd)"
    for path in {{consumer_apps}}; do
      dir="${path/#\~/$HOME}"
      if [[ ! -d "$dir" ]]; then
        echo "missing consumer: $dir" >&2
        exit 1
      fi
      echo "==> schemagen $(basename "$dir")"
      (cd "$dir" && bun "$root/src/cli-tool/main.ts" schemagen)
    done

# Point local consumer apps at this repo (file: dep) for pre-publish development
consumers-dev:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    template="${root}/examples/full-example/.cursor/rules/cli-program.mdc"
    echo "argsbarg@file:<relative-to-consumer> → ${root}"
    for path in {{consumer_apps}}; do
      dir="${path/#\~/$HOME}"
      dir="$(cd "$dir" && pwd)"
      rel="$(bun -e "console.log(require('node:path').relative(process.argv[1], process.argv[2]))" "$dir" "$root")"
      echo "==> $(basename "$dir") ($dir) → file:${rel}"
      (cd "$dir" && bun add "argsbarg@file:${rel}" && bun "${root}/scripts/merge-cli-program-rule.ts" "$dir" && bun "${root}/scripts/merge-code-rule.ts" "$dir")
    done

# Pin consumers to ^<this repo version>, install, merge Cursor rule, build, docgen
consumers-sync:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    latest="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('${root}/package.json','utf8')).version)")"
    echo "argsbarg@^${latest}"
    for path in {{consumer_apps}}; do
      dir="${path/#\~/$HOME}"
      dir="$(cd "$dir" && pwd)"
      echo "==> $(basename "$dir") ($dir)"
      (cd "$dir" && bun add "argsbarg@^${latest}" && bun "${root}/scripts/merge-cli-program-rule.ts" "$dir" && bun "${root}/scripts/merge-code-rule.ts" "$dir")
    done

# Run the minimal example once
example-minimal *ARGS:
    bun ./examples/minimal.ts {{ARGS}}

# Run the minimal example and watch for changes
example-minimal-watch *ARGS:
    bun --watch ./examples/minimal.ts {{ARGS}}

# Run the nested example once
example-nested *ARGS:
    bun ./examples/nested.ts {{ARGS}}

# Run the nested example and watch for changes
example-nested-watch *ARGS:
    bun --watch ./examples/nested.ts {{ARGS}}

# Run the nested example once
example-servers *ARGS:
    bun ./examples/servers.ts {{ARGS}}

# Run the nested example and watch for changes
example-servers-watch *ARGS:
    bun --watch ./examples/servers.ts {{ARGS}}

# Format and lint the codebase (auto-fix)
format:
    bun run biome check ./src ./scripts --write --unsafe

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
    bun run dts-bundle-generator --out-file index.d.ts src/index.ts

# Typecheck without emitting build artifacts
typecheck:
    bun run tsc --noEmit

alias fmt := format
