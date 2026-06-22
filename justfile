# https://github.com/casey/just — run `just` to list recipes.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

_:
    @just --list

# check the codebase
check: typecheck format

# Update local consumer apps: npm i argsbarg@latest, build, docgen
consumers-sync *apps:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    ss="$root/../../ss"
    apps=({{apps}})
    if [[ ${#apps[@]} -eq 0 ]]; then
      apps=(idp-trees sqsp-qa-tools sqsp-i18n-tools)
    fi
    for app in "${apps[@]}"; do
      dir="$(cd "$ss/$app" && pwd)"
      echo "==> $app ($dir)"
      (cd "$dir" && npm i argsbarg@latest --no-package-lock && just build && just docgen)
    done

# run the minimal example
example *ARGS:
    bun ./examples/minimal.ts {{ARGS}}

# run the minimal example and watch for changes
example-watch *ARGS:
    bun --watch ./examples/minimal.ts {{ARGS}}

# format the codebase
format:
    bun run biome check ./src ./scripts --write

# lint the codebase
lint:
    bun run biome check ./src ./scripts

# Typecheck, lint, then run the test suite.
test: check
    bun test

# typecheck the codebase
typecheck:
    bun run tsc --noEmit

# generate type declarations for the package
typegen:
    bunx dts-bundle-generator --out-file index.d.ts src/index.ts

# publish to github and npm
release bump: test typegen
    bun scripts/release.ts {{bump}}

