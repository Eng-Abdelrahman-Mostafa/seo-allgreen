# Changelog

## 1.1.0 — 2026-09-27

- **Next.js support**: `references/nextjs.md` and `templates/nextjs/` (App Router:
  `next.config.ts`, `lib/seo.ts`, layout metadata, `sitemap.ts`, `robots.ts`,
  `llms.txt` route, JSON-LD, interaction-gated analytics, detail-page pattern with
  real 404s before streaming and `<Image preload>`). Tested by building and serving
  a fresh Next.js 16.3.6 app.
- **Install for every major coding agent**: `docs/INSTALL.md`; `install.sh --agent`
  for Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode, Amp, Goose,
  Windsurf, Cline and Kiro (auto-detects by default, `--project` for repo installs);
  instructions for the Claude apps and Aider.
- Release workflow publishes `seo-allgreen.zip` for Claude app uploads.
- `SKILL.md` frontmatter gains `license: MIT` (Agent Skills spec).

## 1.0.0 — 2026-09-27

First public release.

- Skill: workflow, 50 rules, triage map, setup for Vite/React SPAs.
- References: playbook (with Next.js/Nuxt/Astro/host notes), PageSpeed 100 guide
  (Lighthouse 13 audits, metric targets from the scoring curves), Semrush Site
  Audit map (every issue → fix → tool), anonymised case study.
- Templates: prerender with readiness/redirect/error-UI guards, route discovery +
  incremental sitemap, SEOManager, canonical helper, JSON-LD builders,
  Caddy/nginx/Nixpacks configs, robots.txt/sitemap/llms.txt, language-literal gate.
- Tools: `seo-audit.mjs` (live), `pagespeed.mjs` (PSI API or local Lighthouse),
  `verify-dist.mjs` (build gate).
