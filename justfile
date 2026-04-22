# https://github.com/casey/just — run `just` to list recipes.

_:
    @just --list

# typecheck the codebase
check-types:
    bun x tsc

# run the minimal example
example:
    bun ./examples/minimal.ts

# run the minimal example and watch for changes
example-watch:
    bun --watch ./examples/minimal.ts

# format the codebase
format:
    bun x biome format ./src ./scripts --write

# lint the codebase
lint:
    bun x biome check ./src ./scripts

# Typecheck, lint, then run the test suite.
test: check-types format lint
    bun test

# publish to github and npm
release bump: test
    bun scripts/release.ts {{bump}}
