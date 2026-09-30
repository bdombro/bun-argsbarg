# https://github.com/casey/just — run `just` to list recipes.

# bash (not sh); -e bail on errors, -u error on unset vars, pipefail fails pipelines when any stage fails
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

export PATH := justfile_directory() + "/node_modules/.bin:" + env("PATH")

# List available recipes (default)
_:
    @just --list

# Compile src/ to dist/ (what every runtime loads)
build:
    rm -rf dist
    tsc -p tsconfig.build.json

# Format and typecheck
check: format typecheck

# Reinstall the in-repo examples against this checkout (after argsbarg changes)
examples-install: build
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    rm -rf "$root"/examples/*/node_modules
    # npm templates: --install-links packs argsbarg like a published package, so each example resolves
    # argsbarg's zod peer to its own zod (no sharing with this checkout's dev zod).
    for d in cli api agent-plugin; do
      echo "==> $d (npm)"
      (cd "$root/examples/$d" && npm install --no-audit --no-fund --install-links)
    done
    # Homebrew template (Bun): bun copies file: deps; drop the nested copies it drags along.
    for d in homebrew; do
      echo "==> $d (bun)"
      (cd "$root/examples/$d" && bun install --force)
      rm -rf "$root"/examples/$d/node_modules/argsbarg/examples/*/node_modules "$root"/examples/$d/node_modules/argsbarg/node_modules/zod
    done

# Run each template's own test suite (`just test` in each)
examples-test:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    for d in cli api agent-plugin homebrew; do (cd "$root/examples/$d" && just test); done

# Verify in-repo copy templates match argsbarg create output
example-full-check:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    for d in cli api agent-plugin homebrew; do
      node "$root/src/cli-tool/main.ts" create --check "$root/examples/$d"
    done

# Run the minimal example once
example-minimal *ARGS:
    node ./examples/minimal.ts {{ARGS}}

# Run the nested example once
example-nested *ARGS:
    node ./examples/nested.ts {{ARGS}}

# Run the nested example and watch for changes
example-nested-watch *ARGS:
    node --watch ./examples/nested.ts {{ARGS}}

# Run the servers example once
example-servers *ARGS:
    node ./examples/servers.ts {{ARGS}}

# Run the servers example and watch for changes
example-servers-watch *ARGS:
    node --watch ./examples/servers.ts {{ARGS}}

# Format and lint the codebase (auto-fix)
format:
    biome check ./src ./scripts --write --unsafe

# Lint the codebase without writing
lint:
    biome check ./src ./scripts

# Bump version, test, build, tag, and publish to GitHub + npm
release bump: test build
    node scripts/release.ts {{bump}}

# Install dependencies
setup:
    npm install

# Typecheck, lint, then run the test suite
test: check
    node --test "src/**/*.test.ts"

# Typecheck argsbarg (src, scripts, examples/*.ts) and each copy template with its own tsconfig and deps
typecheck:
    tsc --noEmit
    for d in cli api agent-plugin homebrew; do (cd examples/$d && ./node_modules/.bin/tsc --noEmit); done

alias fmt := format
