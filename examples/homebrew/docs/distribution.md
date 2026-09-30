# Homebrew distribution and release (tap-from-repo)

This project packages a Bun-compiled binary and its shell completions for Homebrew with a standard **tap-from-repo** model: the formula lives in this repo's `Formula/`, and releases are GitHub release assets. Everything below is this project's own code (`justfile`, `scripts/`, `Formula/`); argsbarg itself has no Homebrew code.

---

## 1. Distribution Model

Homebrew installs the **binary and shell completions** (formula `install` block, `generate_completions_from_executable`). There is no post-install step: argsbarg doesn't install agent artifacts or manage app settings. Ship an agent skill by documenting `skills/<key>/` (users copy or symlink it) or through an agent plugin.

---

## 2. Distribution Strategies: Public vs. Private Taps

The template supports both public taps and private-repo distribution.

### Strategy A: Public Open-Source Taps (Default)

For open-source projects, Homebrew requires zero authentication. Users can tap your public repository and install your application with standard commands out of the box:

```bash
# Tap the public repository
brew tap bdombro/bun-argsbarg

# Install the application
brew install example-homebrew
```

The generated Homebrew formula points directly to your public GitHub release asset URL, allowing anyone to install and receive automatic updates securely.

### Strategy B: Private & Proprietary Corporate Taps

For internal tools in a private GitHub repository, the formula downloads release assets with the user's `gh` login, so no tokens or raw download links live in the formula.

#### 1. End-User Authentication:
Users authenticate locally using the standard GitHub CLI (`gh`), which Homebrew natively integrates with to retrieve download credentials:

```bash
# 1. Install and authenticate with GitHub CLI (if not already done)
brew install gh
gh auth login

# 2. Tap and install your private corporate repository
brew tap bdombro/bun-argsbarg git@github.com:bdombro/bun-argsbarg.git
brew install example-homebrew
```

#### 2. The Private Release Strategy:
Formulas written by the template's release script use a custom **`GitHubPrivateReleaseDownloadStrategy`**. This strategy executes the secure asset download through standard GitHub API requests, leveraging the user's local `gh` login credentials securely under the hood:

```ruby
url "https://github.com/bdombro/bun-argsbarg/releases/download/vX.Y.Z/example-homebrew.zip",
    using: GitHubPrivateReleaseDownloadStrategy
```

---

## 3. Standardized Formula Pattern

The release script writes `Formula/example-homebrew.rb`, which looks like:

```ruby
class ExampleHomebrew < Formula
  desc "…"
  homepage "https://github.com/bdombro/bun-argsbarg"
  url "https://github.com/bdombro/bun-argsbarg/releases/download/v1.0.0/example-homebrew.zip"
  sha256 "a1b2c3d4e5f6g7h8..."
  version "1.0.0"

  def install
    bin.install "example-homebrew"
    # Auto-generates shell completions for bash, zsh, and fish directly from the executable
    generate_completions_from_executable(bin/"example-homebrew", "completion", base_name: "example-homebrew")
  end
end
```

---

## 4. Developer Iteration Workflow

Build, install, and test the formula locally before releasing.

### Local Staging Commands:

```bash
# 1. Build the local release binary
just build

# 2. Uninstall any existing formula/tap, stage and install locally
just install-local

# 3. Swap updated binaries quickly during tight edit cycles
just reinstall-local

# 4. Uninstall the binary and untap
just uninstall
```

### Under the Hood:

To ensure you test the exact formula that will be shipped to production, `just install-local` runs:

1.  `just uninstall` — remove keg and untap.
2.  `bun scripts/dev-formula.ts install` — Safely backs up your production formula and writes a temporary local dev formula using a `file://` URL pointing to your build directory.
3.  `brew reinstall || brew install --force` — Installs the package locally using Homebrew.
4.  `bun scripts/dev-formula.ts reset` — Automatically restores your production formula on disk.

---

## 5. Automated Release Pipeline

One command releases:

```bash
# Performs build, zips binary, updates Formula with new SHA-256, tags git, pushes, and uploads release asset
just release patch   # or minor | major (asks first; --dry-run changes nothing)
```

The formula class name (PascalCase of the key), homepage, and tap come from `src/create-identity.ts` (`key`, `releaseRepo`) via `scripts/formula-shared.ts`; edit them there.

### Release Pipeline Steps:

1.  **Build**: Compiles the binary to `dist/example-homebrew`.
2.  **Archive**: Packages the binary into a compressed `dist/example-homebrew.zip`.
3.  **Integrity Check**: Calculates the cryptographically secure SHA-256 hash of the zip file.
4.  **Formula Sync**: Updates the version number and `sha256` parameter in `Formula/example-homebrew.rb`.
5.  **Tag & Push**: Commits changes, tags the repository with the new version, pushes to GitHub, and publishes the compiled zip to GitHub Releases.

### Older Release Retention & Cleanup:

To keep your storage footprint clean, the pipeline supports purging stale historical release assets while preserving the git tags:

```bash
just release --purge              # Interactive tag purge of older release records
just release --purge --yes        # Silent automated purge (useful in CI/CD)
just release --purge --dry-run    # Preview list of tag deletions
```

---
