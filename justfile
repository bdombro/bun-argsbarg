# https://github.com/casey/just — run `just` to list recipes.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

_:
    @just --list

# check the codebase
check: typecheck format


consumer_apps := "idp-trees sqsp-qa-tools sqsp-i18n-tools"

# Point local consumer apps at this repo (file: dep) for pre-publish development
consumers-dev:
    #!/usr/bin/env bash
    root="$(cd "{{justfile_directory()}}" && pwd)"
    ss="$root/../../ss"
    template="${root}/docs/templates/cursor/rules/cli-program.mdc"
    echo "argsbarg@file:<relative-to-consumer> → ${root}"
    for app in {{consumer_apps}}; do
      dir="$(cd "$ss/$app" && pwd)"
      rel="$(bun -e "console.log(require('node:path').relative(process.argv[1], process.argv[2]))" "$dir" "$root")"
      echo "==> $app ($dir) → file:${rel}"
      (cd "$dir" && bun add "argsbarg@file:${rel}" && bun "${root}/scripts/merge-cli-program-rule.ts" "$dir" "$template")
    done

# Update local consumer apps: pin argsbarg to ^<this repo version> in package.json, install, build, docgen
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



# run the minimal example
example *ARGS:
    bun ./examples/minimal.ts {{ARGS}}

# run the minimal example and watch for changes
example-watch *ARGS:
    bun --watch ./examples/minimal.ts {{ARGS}}

alias fmt := format
# format the codebase
format:
    bun run biome check ./src ./scripts --write

# lint the codebase
lint:
    bun run biome check ./src ./scripts

# Typecheck, lint, then run the test suite.
test: check
    bun test

# Install deps for examples/consumer-app (kitchen-sink)
consumer-app-install:
    cd examples/consumer-app && bun install

# Regenerate JSON Schema artifacts in examples/consumer-app
consumer-app-schemagen:
    cd examples/consumer-app && bun run schemagen

# Verify committed schemas match schemagen output
check-sink: consumer-app-schemagen
    #!/usr/bin/env bash
    cd examples/consumer-app
    git diff --exit-code schemas/ || {
      echo "examples/consumer-app/schemas/ is out of date — run: just consumer-app-schemagen"
      exit 1
    }

# typecheck the codebase
typecheck:
    bun run tsc --noEmit

# generate type declarations for the package
typegen:
    bunx dts-bundle-generator --out-file index.d.ts src/index.ts

# publish to github and npm
release bump: test typegen
    bun scripts/release.ts {{bump}}

