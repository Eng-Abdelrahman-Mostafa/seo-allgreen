#!/usr/bin/env bash
# Install the seo-allgreen Agent Skill into one or more coding agents.
#
#   curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash
#   … | bash -s -- --agent codex            # one agent
#   … | bash -s -- --agent claude,cursor    # several
#   … | bash -s -- --agent all --project    # into the current project instead of your home dir
#
# Agents and the folders they read (Agent Skills standard, agentskills.io):
#   claude    ~/.claude/skills        .claude/skills          Claude Code
#   agents    ~/.agents/skills        .agents/skills          shared path read by Codex, Cursor,
#             GitHub Copilot / VS Code, Gemini CLI, OpenCode, Amp, Goose, Windsurf
#   cline     ~/.cline/skills         .cline/skills           Cline
#   kiro      ~/.kiro/skills          .kiro/skills            Kiro
# Aliases for "agents": codex cursor copilot vscode gemini opencode amp goose windsurf
#
# Default (no --agent): auto-detect. Installs for Claude Code if ~/.claude exists,
# to the shared ~/.agents/skills if any other supported agent is found, plus
# Cline/Kiro if present. Falls back to ~/.agents/skills.
set -euo pipefail

REPO="${SEO_ALLGREEN_REPO:-https://github.com/Eng-Abdelrahman-Mostafa/seo-allgreen.git}"
SKILL_PATH="plugins/seo-allgreen/skills/seo-allgreen"
AGENTS="auto"
SCOPE="user"

while [ $# -gt 0 ]; do
  case "$1" in
    --agent|-a) AGENTS="${2:?--agent needs a value}"; shift 2 ;;
    --agent=*) AGENTS="${1#*=}"; shift ;;
    --project|-p) SCOPE="project"; shift ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

base() { [ "$SCOPE" = "project" ] && pwd || echo "$HOME"; }
dir_for() {
  case "$1" in
    claude) echo "$(base)/.claude/skills" ;;
    agents|codex|cursor|copilot|vscode|gemini|opencode|amp|goose|windsurf) echo "$(base)/.agents/skills" ;;
    cline) echo "$(base)/.cline/skills" ;;
    kiro) echo "$(base)/.kiro/skills" ;;
    *) echo "unknown agent: $1 (use claude, agents, codex, cursor, copilot, gemini, opencode, amp, goose, windsurf, cline, kiro, all)" >&2; return 1 ;;
  esac
}

if [ "$AGENTS" = "all" ]; then
  AGENTS="claude,agents,cline,kiro"
elif [ "$AGENTS" = "auto" ]; then
  found=""
  [ -d "$HOME/.claude" ] && found="$found,claude"
  for d in .codex .cursor .copilot .gemini .config/opencode .config/amp .config/goose .codeium .agents; do
    [ -d "$HOME/$d" ] && { found="$found,agents"; break; }
  done
  [ -d "$HOME/.cline" ] && found="$found,cline"
  [ -d "$HOME/.kiro" ] && found="$found,kiro"
  AGENTS="${found#,}"
  [ -z "$AGENTS" ] && AGENTS="agents"
fi

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git clone --depth 1 --quiet "$REPO" "$TMP/repo"
[ -f "$TMP/repo/$SKILL_PATH/SKILL.md" ] || { echo "skill not found in repo" >&2; exit 1; }

done_dirs=" "
IFS=',' read -r -a LIST <<< "$AGENTS"
for a in "${LIST[@]}"; do
  d="$(dir_for "$a")"
  case "$done_dirs" in *" $d "*) continue ;; esac   # several aliases share one dir
  mkdir -p "$d"
  rm -rf "$d/seo-allgreen"
  cp -R "$TMP/repo/$SKILL_PATH" "$d/seo-allgreen"
  done_dirs="$done_dirs$d "
  echo "✓ $a → $d/seo-allgreen"
done

echo
echo "Restart your agent (or start a new session), then ask for an SEO audit."
echo "Claude Code: /seo-allgreen   ·   Codex: \$seo-allgreen   ·   others: mention the skill or just ask."
