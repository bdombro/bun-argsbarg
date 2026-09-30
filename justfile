# https://github.com/casey/just — run `just` to list recipes.

# bash (not sh); -e bail on errors, -u error on unset vars, pipefail fails pipelines when any stage fails
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Local argsbarg consumer repos (machine-specific).
consumer_apps := "~/dev/ss/sqsp-workspaces ~/dev/ss/sqsp-qa-manager-poc"

# List available recipes (default)
_:
    @just --list

# Typecheck and format the codebase
check: format typecheck

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

# Point local consumer apps at this repo (file: dep) for pre-publish development
consumers-dev:
    #!/usr/bin/env bash
    set -euo pipefail
    root="$(cd "{{justfile_directory()}}" && pwd)"
    # A file: install copies examples/*/node_modules into the consumer (recursively); clear them first.
    rm -rf "$root"/examples/*/node_modules
    echo "argsbarg@file:<relative-to-consumer> → ${root}"
    for path in {{consumer_apps}}; do
      dir="${path/#\~/$HOME}"
      dir="$(cd "$dir" && pwd)"
      rel="$(bun -e "console.log(require('node:path').relative(process.argv[1], process.argv[2]))" "$dir" "$root")"
      echo "==> $(basename "$dir") ($dir) → bun add argsbarg@file:${rel}"
      # --force: bun's cached file: snapshot goes stale when argsbarg files are deleted (ENOENT).
      # Drop argsbarg's own dev copy of zod so the consumer bundles a single zod.
      (cd "$dir" && bun add "argsbarg@file:${rel}" --force && bun add zod@^4 \
        && rm -rf node_modules/argsbarg/node_modules/zod \
        && test -f node_modules/argsbarg/bin/argsbarg && ln -sf ../argsbarg/bin/argsbarg node_modules/.bin/argsbarg \
        && bun "${root}/scripts/merge-agents-md.ts" "$dir")
    done
    echo "Examples' node_modules were cleared; run \`just examples-install\` to restore them."

# Pin consumers to ^<version>; merge rules; build, docgen, install-local (configure install → ~/.agents/)
consumers-sync:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    latest="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('${root}/package.json','utf8')).version)")"
    echo "argsbarg@^${latest}"
    for path in {{consumer_apps}}; do
      dir="${path/#\~/$HOME}"
      dir="$(cd "$dir" && pwd)"
      echo "==> $(basename "$dir") ($dir)"
      (cd "$dir" && bun add "argsbarg@^${latest}" && \
        bun "${root}/scripts/merge-agents-md.ts" "$dir" && \
        just build && just docgen && just install-local)
    done

# Pin consumers to ^<version> only. Does not do full upgrades.
consumers-up:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    latest="$(bun -e "console.log(JSON.parse(require('node:fs').readFileSync('${root}/package.json','utf8')).version)")"
    echo "argsbarg@^${latest}"
    for path in {{consumer_apps}}; do
      dir="${path/#\~/$HOME}"
      dir="$(cd "$dir" && pwd)"
      echo "==> $(basename "$dir") ($dir)"
      (cd "$dir" && bun add "argsbarg@^${latest}")
    done

# Reinstall the in-repo examples against this checkout (after typegen, deletions, or consumers-dev)
examples-install:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    rm -rf "$root"/examples/*/node_modules
    for d in cli api agent-plugin; do
      echo "==> $d"
      (cd "$root/examples/$d" && bun install --force)
    done
    # Each file: install copies the other examples' node_modules and argsbarg's dev zod; drop both.
    rm -rf "$root"/examples/*/node_modules/argsbarg/examples/*/node_modules "$root"/examples/*/node_modules/argsbarg/node_modules/zod

# Run the full example (use the justfile in the examples/cli directory)
example-full:
    echo "Use the justfile in the examples/cli directory."
    exit 1

# Verify in-repo copy templates match argsbarg create output
example-full-check:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    bun "$root/src/cli-tool/main.ts" create --check "$root/examples/cli"
    bun "$root/src/cli-tool/main.ts" create --check "$root/examples/api"
    bun "$root/src/cli-tool/main.ts" create --check "$root/examples/agent-plugin"

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
