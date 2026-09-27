# Install seo-allgreen in your coding agent

`seo-allgreen` is an [Agent Skill](https://agentskills.io): one folder with a
`SKILL.md`, which works in every agent that supports the open standard. Agents only
differ in **which folder they read**. The installer handles that for you.

## Quick install (any agent)

```bash
# auto-detects the agents you have installed
curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash

# or pick agents explicitly (comma-separated)
curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash -s -- --agent codex,cursor

# install into the current project instead of your home directory (commit it to share with your team)
curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash -s -- --agent all --project
```

Windows: run the commands in WSL or Git Bash, or copy the folder manually (below).

## Per agent

Paths were checked against each vendor's documentation (September 2026).
"Manual" means: copy `plugins/seo-allgreen/skills/seo-allgreen/` from this repo
to the folder shown, keeping the folder name `seo-allgreen`.

| Agent | Installer flag | User folder | Project folder | Use it |
|---|---|---|---|---|
| **Claude Code** | `claude` (or plugin, below) | `~/.claude/skills/` | `.claude/skills/` | `/seo-allgreen` or just ask |
| **OpenAI Codex** (CLI, IDE, app) | `codex` | `~/.agents/skills/` | `.agents/skills/` | `$seo-allgreen` or just ask |
| **Cursor** | `cursor` | `~/.agents/skills/` (also `~/.cursor/skills/`) | `.agents/skills/` (also `.cursor/skills/`) | ask in Agent chat |
| **GitHub Copilot** (VS Code, CLI, coding agent) | `copilot` | `~/.agents/skills/` (also `~/.copilot/skills/`) | `.agents/skills/` (also `.github/skills/`) | ask in agent mode |
| **Gemini CLI** | `gemini` | `~/.agents/skills/` (also `~/.gemini/skills/`) | `.agents/skills/` (also `.gemini/skills/`) | `/skills` to list, then ask |
| **OpenCode** | `opencode` | `~/.agents/skills/` (also `~/.config/opencode/skills/`) | `.agents/skills/` (also `.opencode/skills/`) | ask |
| **Amp** | `amp` | `~/.agents/skills/` (also `~/.config/amp/skills/`) | `.agents/skills/` | ask |
| **Goose** | `goose` | `~/.agents/skills/` | `.agents/skills/` | ask |
| **Windsurf** | `windsurf` | `~/.agents/skills/` (also `~/.codeium/windsurf/skills/`) | `.agents/skills/` (also `.windsurf/skills/`) | `@seo-allgreen` (auto-invocation is unreliable) |
| **Cline** | `cline` | `~/.cline/skills/` | `.cline/skills/` | ask |
| **Kiro** | `kiro` | `~/.kiro/skills/` | `.kiro/skills/` | ask, or import from GitHub (below) |

Several agents (Cursor, VS Code, OpenCode, Windsurf, Amp) also read
`~/.claude/skills/`. If you install to both `.claude` and `.agents`, some agents may
list the skill twice. That's harmless, but you can install to only one to avoid it.

### Claude Code — plugin (auto-updates)

```
/plugin marketplace add Eng-Abdelrahman-Mostafa/seo-allgreen
/plugin install seo-allgreen@seo-allgreen
```

Invoke with `/seo-allgreen:seo-allgreen`, or just ask about SEO.

### Claude apps (claude.ai web, desktop, mobile)

1. Download `seo-allgreen.zip` from the
   [latest release](https://github.com/Eng-Abdelrahman-Mostafa/seo-allgreen/releases/latest)
   (its root is the `seo-allgreen/` folder).
2. **Settings → Capabilities → Skills → Add skill → Upload**, and choose the zip.
   Code execution must be enabled.

The bundled Node tools need a machine with Node 18+. In the Claude apps the skill
still gives the full method, checklists and templates.

### Kiro — import from GitHub

In Kiro's skills panel, import from this URL:
`https://github.com/Eng-Abdelrahman-Mostafa/seo-allgreen/tree/main/plugins/seo-allgreen/skills/seo-allgreen`

### Aider (no skills folder)

Aider has no skill discovery, so load the skill as read-only context:

```bash
git clone --depth 1 https://github.com/Eng-Abdelrahman-Mostafa/seo-allgreen ~/seo-allgreen
aider --read ~/seo-allgreen/plugins/seo-allgreen/skills/seo-allgreen/SKILL.md
```

Or add `read: [~/seo-allgreen/plugins/seo-allgreen/skills/seo-allgreen/SKILL.md]`
to `.aider.conf.yml`. Ask Aider to open files under `references/` when it needs them.

### Any other agent

If it supports Agent Skills, copy the folder into its skills directory (see
[agentskills.io/clients](https://agentskills.io/clients)). If it doesn't, point its
rules/instructions file (e.g. `AGENTS.md`) at the skill:

```md
For SEO, PageSpeed or Semrush work, read and follow
<path>/seo-allgreen/SKILL.md and the files it references.
```

## Update

- Plugin: `/plugin` → update, or `claude plugin update seo-allgreen@seo-allgreen`.
- Everything else: re-run the installer with the same flags (it replaces the folder).

## Uninstall

Delete the `seo-allgreen` folder from the directories above, or
`claude plugin uninstall seo-allgreen@seo-allgreen`.

## Requirements

- Node 18+ for the tools (`seo-audit.mjs`, `pagespeed.mjs`, `verify-dist.mjs`). They have no dependencies.
- Chrome or Chromium + `puppeteer-core` for SPA pre-rendering; Chrome for `pagespeed.mjs --local`.
- `git` for the installer.
