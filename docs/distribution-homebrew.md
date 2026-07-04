# Shipping via Homebrew (tap-from-repo)

Argsbarg apps distribute the **binary and shell completions** through Homebrew, and **agent artifacts** (skills, MCP config) through `configure --sync`.

## Distribution model

| Layer | Mechanism |
| --- | --- |
| Binary + completions | Formula `install` block |
| Skills + MCP | Formula `post_install` → `{key} configure --sync --yes` |
| App config | User opt-in: `{key} configure` (interactive; not run from formula `post_install`) |

**Only tap-from-repo** — in-repo `Formula/` or GitHub tap. Not Homebrew core.

### End-user install

```bash
brew tap <org>/<repo>
brew install <tap>/{key}
{key} configure   # when app config is required
```

### Developer install

```bash
just build
just install-local    # or `just install` (alias)
just reinstall-local   # fast binary swap (`install -m 755` into Cellar; run install-local first)
just uninstall        # undo formula + agent artifacts (not app config)
```

Dev and release use the **same formula** (`Formula/{key}.rb`, class name, install/post_install/test). `gen-dev-formula.ts` only changes `url`, `version`, and `sha256` to point at the local binary in `Formula/.staging/`. Release bumps restore the GitHub URL via `scripts/release.ts`.

### Developer uninstall

| Recipe | Removes |
| --- | --- |
| `just uninstall` | Formula `{key}` + tap symlink + skills/MCP |
| `just uninstall-config` | App config file only (`configure --remove-config --yes`) |
| `just uninstall-release` | Release formula from `{tap}` (keeps tap) |
| `just uninstall-release-tap` | Release formula + `brew untap {tap}` |
| `just test-release` | Install release formula and run formula test |

End users: `<key> configure --remove-all --yes` then `brew uninstall <tap>/<key>`.

## Formula pattern

```ruby
def install
  bin.install "{key}"
  generate_completions_from_executable(bin/"{key}", "completion", base_name: "{key}")
end

def post_install
  system bin/"{key}", "configure", "--sync", "--yes"
end
```

Completions require users to configure their shell per [Homebrew Shell Completion](https://docs.brew.sh/Shell-Completion).

**Why configure is separate from `post_install`:** the wizard is interactive (TTY + prompts for secrets). Formula `post_install` runs non-interactively during `brew install` and in CI (`brew test`). Apps with `appConfig` print a one-line configure hint in formula `caveats` instead.

## Bootstrap CLI (`argsbarg create`)

Copy the shipped `examples/full-example` template into a new directory with identity substitutions, then run install, schemagen, tests, and git init (when appropriate):

```bash
bunx argsbarg create my-cli \
  --key my-cli --class-name MyCli --tap org/my-cli \
  --homepage https://github.com/org/my-cli --release-repo org/my-cli \
  --yes
```

On a TTY, omit flags to use the interactive wizard. Verify an existing tree:

```bash
bunx argsbarg create --check .
```

Template source: [`examples/full-example/`](../examples/full-example/) in the argsbarg package (also under `node_modules/argsbarg/examples/full-example` after `bun add argsbarg`).

**Git bootstrap skip rules:** post-create skips `git init` when the target already has a `.git` directory, or when the target sits inside an existing git work tree (e.g. a monorepo subfolder). Standalone new directories get an `Initial commit`.

## Release workflow

1. `just build` → `dist/{key}`
2. `scripts/release.ts` → writes `Formula/{key}.rb` (GitHub URL + sha256), commits, tags, uploads `dist/{key}` to GitHub Releases
3. Users `brew upgrade {key}` from the tap

## Removed (breaking)

- Self-install to `~/.local/bin`
- Top-level `install` and `uninstall` commands (use `configure`)
- `install --update` / `updateGetLatest`
- Homebrew completion installer via CLI (Homebrew owns completions)
- Bare-argv install bootstrap
- Auto configure wizard after sync
- Separate `{key}-local` formula and `{key}/dev` tap

## Config path

Default: `~/.local/lib/<sanitized-key>/config.json`

Export helpers: `resolveAppConfigPath`, `displayAppConfigPath` from `argsbarg`.
