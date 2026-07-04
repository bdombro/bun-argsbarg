#!/usr/bin/env bash
# Ensure HOMEBREW_GITHUB_API_TOKEN is set for private GitHub release downloads.
: "${HOMEBREW_GITHUB_API_TOKEN:=$(gh auth token 2>/dev/null || true)}"
if [[ -z "${HOMEBREW_GITHUB_API_TOKEN}" ]]; then
  echo "HOMEBREW_GITHUB_API_TOKEN is required to download private GitHub release assets." >&2
  echo "Use: HOMEBREW_GITHUB_API_TOKEN=\"\$(gh auth token)\" (if gh is installed)" >&2
  echo "Or create a PAT at https://github.com/settings/personal-access-tokens/new (Contents read on the tap repo)." >&2
  exit 1
fi
export HOMEBREW_GITHUB_API_TOKEN
