# SEO All-Green

> All four PageSpeed scores green. Zero code-caused Semrush errors. Every SPA page crawlable.

**A Claude Code skill for technical SEO: audit any site, make React/Vite SPAs
crawlable, pass Semrush Site Audit, and reach 100 in PageSpeed Insights.**

Built from a real production project, an Arabic-first React SPA where a
Semrush crawl scored 67 % health with 221 errors. Over 45 commits it went to 62 pre-rendered
pages with zero code-caused errors, 3.7 → 2.2 s first paint on mobile, and
0 duplicate descriptions. Every rule in the skill is a bug that actually
happened, with the fix and the check that proves it.

## Install

**As a plugin (recommended, updates with `/plugin`):**

```
/plugin marketplace add Eng-Abdelrahman-Mostafa/seo-allgreen
/plugin install seo-allgreen@seo-allgreen
```

**Or copy the skill** (no plugin system):

```bash
curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash
# just for one project:
curl -fsSL https://raw.githubusercontent.com/Eng-Abdelrahman-Mostafa/seo-allgreen/main/install.sh | bash -s -- --project
```

**Or manually:** copy `plugins/seo-allgreen/skills/seo-allgreen/` to
`~/.claude/skills/seo-allgreen/` (all projects) or `<project>/.claude/skills/seo-allgreen/`.

Start a new Claude Code session. The skill loads automatically when you ask
about SEO, or call it directly: `/seo-allgreen` (`/seo-allgreen:seo-allgreen` as a plugin).

## Use

Just ask:

- "Audit the SEO of https://example.com"
- "Pre-render this Vite app so Google sees the content"
- "Fix these Semrush errors" (paste or attach the export)
- "Get this page to 100 on PageSpeed"
- "Add canonicals, a sitemap and structured data"

The tools also run on their own, with **Node 18+ and no dependencies**:

```bash
T=plugins/seo-allgreen/skills/seo-allgreen/templates/tools
node $T/seo-audit.mjs https://example.com            # live technical SEO + Semrush heuristics
node $T/pagespeed.mjs https://example.com/ --both    # PageSpeed scores + what blocks 100
node $T/pagespeed.mjs https://example.com/ --local   # same engine locally (no API quota)
node $T/verify-dist.mjs dist                         # gate a pre-rendered build before deploy
```

## What's inside

```
plugins/seo-allgreen/skills/seo-allgreen/
├── SKILL.md                     workflow, 50 rules, triage map, setup
├── references/
│   ├── playbook.md              deep detail per area + Next.js / Nuxt / Astro / hosts
│   ├── pagespeed-100.md         exact metric targets for 100, every Lighthouse 13 audit
│   ├── semrush-checks.md        every Semrush Site Audit issue → fix → tool
│   └── case-study.md            what broke, why, measured results (anonymised)
└── templates/
    ├── seo.config.mjs           one config file for the scripts
    ├── scripts/                 prerender, route discovery + sitemap, language gate
    ├── src/                     SEOManager.jsx, canonicalUrl.js, structuredData.js
    ├── server/                  Caddyfile, nginx.conf, nixpacks.toml
    ├── public/                  robots.txt, sitemap.xml, llms.txt
    ├── snippets/                vite.config, main.jsx, idle/interaction analytics
    └── tools/                   seo-audit, pagespeed, verify-dist
```

Highlights:

- **Pre-renderer that doesn't lie.** It only writes a page once its own SEO tags
  and real text have rendered. It refuses redirects and pages showing error
  dialogs, survives Chrome crashes, writes a noindex fallback shell, fills
  bare directories, and adds only *rendered* URLs to the sitemap.
- **Canonical/URL discipline.** One helper shared by the app and the sitemap,
  the trailing-slash convention, and canonicals that never come from an API.
- **Server configs** tested with real Caddy and curl: a single absolute 301,
  a noindex fallback, and a cache matrix.
- **PageSpeed 100 guide** with targets computed from Lighthouse's own scoring
  curves (mobile: TBT ≤ 80 ms, LCP ≤ 1.7 s, CLS ≤ 0.047, FCP ≤ 1.19 s).
- **Semrush map** covering all ~100 Site Audit issues, their thresholds, and
  which tool checks each one.

## What it can and can't promise

It fixes everything that comes from **code and configuration**, and tells you
precisely what's left. It can't guarantee a perfect score everywhere:

- Semrush's *low text-to-HTML ratio* and *low word count* warnings clear only
  with real page content (Google says the ratio isn't a ranking factor).
- PageSpeed Best Practices stays below 100 while third-party trackers set
  cookies on load. The guide shows the consent/interaction pattern, and the
  trade-off is yours to decide.
- Certificates, HSTS and CDN redirect codes live in your CDN or host.

## Requirements

- [Claude Code](https://claude.com/claude-code) for the skill.
- Node 18+ for the tools.
- For pre-rendering: `puppeteer-core` and Chrome or Chromium.
- For `pagespeed.mjs --local`: Chrome (it runs `npx lighthouse`).
- Optional: a free `PSI_API_KEY` for the PageSpeed Insights API.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). New rules should
come with the failure that motivated them and a way to verify the fix.

## License

[MIT](LICENSE)
