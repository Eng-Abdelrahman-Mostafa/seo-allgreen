#!/usr/bin/env bash
# Install the seo-allgreen skill without the plugin system.
#   curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash
#   curl -fsSL …/install.sh | bash -s -- --project     # into ./.claude/skills of the current project
set -euo pipefail
REPO="${SEO_ALLGREEN_REPO:-https://github.com/Eng-Abdelrahman-Mostafa/seo-allgreen.git}"
DEST="${HOME}/.claude/skills"
[ "${1:-}" = "--project" ] && DEST="$(pwd)/.claude/skills"

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git clone --depth 1 --quiet "$REPO" "$TMP/repo"
mkdir -p "$DEST"
rm -rf "$DEST/seo-allgreen"
cp -R "$TMP/repo/plugins/seo-allgreen/skills/seo-allgreen" "$DEST/seo-allgreen"
echo "✓ seo-allgreen installed to $DEST/seo-allgreen"
echo "  Start a new Claude Code session and type /seo-allgreen (or just ask for an SEO audit)."
