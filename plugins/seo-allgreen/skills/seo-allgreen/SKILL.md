---
name: seo-allgreen
description: End-to-end technical SEO for any website, especially client-rendered SPAs (React/Vite/CRA/Vue) that crawlers see as an empty shell. Use when asked to audit or fix SEO, triage a Semrush / Ahrefs / Search Console / Lighthouse report, pre-render an SPA, set up canonicals, trailing-slash URLs, sitemap, robots.txt, llms.txt, hreflang, Open Graph or JSON-LD structured data, fix soft 404s, duplicate titles/descriptions, broken or redirecting internal links, redirect chains, Cloudflare side effects, server/CDN config (Caddy, nginx, Nixpacks, Coolify), Core Web Vitals, or getting 100 in all four PageSpeed Insights / Lighthouse scores (Performance, Accessibility, Best Practices, SEO), or apply a client's meta/keyword sheet. Ships a live-site audit tool, a build verifier, a generic prerender + sitemap pipeline, SEOManager and schema templates, and server configs, derived from a production site.
---

# SEO All-Green

A complete, battle-tested SEO method. Every rule below broke a real production
site once (an Arabic-first Vite SPA in production — 45 commits; a Semrush crawl scored 67 % with 221 errors, and all five root causes were fixed).
Lighthouse curves and the Semrush issue list were re-checked against official
sources on 2026-09-27 ([semrush-checks.md](references/semrush-checks.md)).
The case study with numbers is in [references/case-study.md](references/case-study.md).

## What's in the box

| Path | Use |
|---|---|
| `templates/tools/seo-audit.mjs` | **Start here.** Live audit of any URL: redirects, robots, sitemap, soft 404s, canonicals, duplicates, hreflang, JSON-LD, Cloudflare email links, empty SPA shells, broken internal links. `node seo-audit.mjs https://site.com` |
| `templates/tools/pagespeed.mjs` | PageSpeed Insights from the CLI: 4 scores, metrics vs the values needed for 100, every failing audit with savings. `--both`, `--runs 3`, `--local` (no API quota, works on localhost) |
| `templates/tools/verify-dist.mjs` | Gate a pre-rendered build before deploy (exit 1 on regressions). `node verify-dist.mjs dist` |
| `templates/scripts/check-language-literals.mjs` | Build gate that fails on hard-coded language lists in hreflang/sitemap code (for multi-language sites) |
| `templates/seo.config.mjs` | The only per-project file the scripts need |
| `templates/scripts/prerender.mjs` | Headless-Chrome pre-render with readiness gate, crash recovery, noindex fallback shell, incremental sitemap |
| `templates/scripts/generate-seo-routes.mjs` | Discovers dynamic detail routes from the API; exports the sitemap writer |
| `templates/src/utils/canonicalUrl.js` | Single source of URL shape (app + sitemap) |
| `templates/src/components/SEOManager.jsx` | One component for all page tags, with the correct precedence |
| `templates/src/utils/structuredData.js` | JSON-LD graph builders (Org, WebSite, Breadcrumb, Course, Product, Article, Person, FAQ) |
| `templates/server/` | `Caddyfile` and `nixpacks.toml` (validated and curl-tested); `nginx.conf` (same behaviour, **not run** — curl the four serving cases before shipping) |
| `templates/snippets/` | `vite.config`, `main.jsx` and `index.html` fragments: CI build, SW denylist, chunking, safe mount, idle analytics |
| `templates/public/` | `robots.txt` (search + AI-answer bots allowed, training bots blocked), `sitemap.xml`, `llms.txt` |
| [references/playbook.md](references/playbook.md) | Deep detail per area + adapting to Next.js / Nuxt / Astro / Netlify / Vercel |
| [references/pagespeed-100.md](references/pagespeed-100.md) | **100 in all four PageSpeed scores**: scoring maths and exact metric targets, every weighted Lighthouse 13 audit and how to pass it, third-party strategy, SPA recipe, checklist |
| [references/semrush-checks.md](references/semrush-checks.md) | **Every Semrush Site Audit issue** (errors, warnings, notices) → fix, law, and which tool checks it; thresholds; what can't be guaranteed |
| [references/case-study.md](references/case-study.md) | What broke, why, how it was fixed, measured results |

## Workflow

Follow in order. Don't change code before phase 1 is done.

**0. Discover the real system** (most wasted time came from skipping this)
- Stack and rendering mode: SPA (empty `#root` in view-source) vs SSR/SSG.
- **Which config production actually serves.** Repos often carry a Dockerfile +
  nginx.conf that production never uses (e.g. Nixpacks/Caddy is live). A fix in
  the unused file never ships. Confirm from the deploy platform's build log.
- CDN in front (Cloudflare?) — it rewrites redirects, cache headers and emails.
- API host the build uses (stale hosts in `.env`/Dockerfile silently yield 0 routes).
- Which languages actually have content (not which the UI supports).

**1. Audit the live site** — `node templates/tools/seo-audit.mjs https://site.com`,
plus the client's Semrush/GSC export. Verify every reported error with `curl`
before believing it: several "bugs" were a stale deploy image or the CDN. The
same goes for your own notes: don't write down crawler behaviour you haven't
checked (a code comment claiming "Facebook ignores bare og:locale" had to be
retracted).

**2. Make content crawlable.** SPA → pre-render (setup below). SSR → skip.
Links must be real `<a href>` in the HTML, not `<button onClick={navigate}>`.

**3. Fix URL shape.** Pick the form that answers 200 (a directory → trailing
slash) and publish exactly that everywhere. One helper, used by app and sitemap.

**4. Page tags** via one `SEOManager` per page. **5. Structured data.**
**6. Sitemap / robots / llms.txt.** **7. hreflang** (usually: self-reference only).
**8. Serving + CDN.** **9. Performance + on-page quality.**

**9b. PageSpeed 100** — `node templates/tools/pagespeed.mjs <canonical URL> --both --runs 3`,
then work through [pagespeed-100.md](references/pagespeed-100.md): highest
weight first (TBT 30 %, LCP 25 %, CLS 25 %), third parties early — they block
both Performance and Best Practices.

**10. Verify and report with numbers** — `verify-dist.mjs` on the build, curl
against a locally running server, the audit again after deploy. Report counts
("62/62 rendered, 0 duplicate descriptions, first paint 3.7 → 2.2 s").

## The laws

**Rendering**
1. Many crawlers (AI bots, social scrapers, Semrush by default) don't run JS,
   and Google renders late. SPA pages must be pre-rendered or SSR'd.
2. A pre-render snapshot is valid only when the page's **own SEO tags exist and
   real text rendered**. "Root has children" is satisfied by a spinner.
3. Never bake a redirected render (auth → /login) under the requested URL.
4. Unrendered URLs must get a **noindex** shell — never the pre-rendered
   homepage (every unknown/private URL becomes a 200 duplicate of home).
5. Bare route directories (`/product/` holding `/product/1/`) answer 403 — put
   the shell in them.
6. The sitemap lists only URLs that **actually rendered**, flushed per route so a
   killed build still leaves it consistent.
7. SEO build steps soft-fail (never break a deploy) but report failures loudly.
8. Strip analytics that injected themselves during render; strip library CSS
   injected at import time (SweetAlert2 added 30 KB to every page); trim baked
   `modulepreload` hints to the render chain; reveal animation initial states.
   **Never save a page showing an error dialog/toast** (an API call failed
   mid-render); the prerender's `errorSelectors` guard refuses it.
9. Pre-rendered pages mount with `createRoot`, not hydration, for highly dynamic
   apps; don't hide `#root` behind a splash that the pre-render removed.

**URLs and canonicals**
10. Publish only URLs that answer **200 directly** — sitemap, canonical,
    og:url, hreflang, JSON-LD, internal links. One helper decides the shape.
11. Canonical = site origin + the path actually served. **Never** trust an API's
    `canonical_url` — backends describe their own URL space (host, path, ids).
12. Canonicals drop query strings (robots blocks `/*?*`) except a declared
    language param.
13. Redirects are single-hop, absolute `https://`, 301. A relative Location
    behind a TLS proxy becomes `http://` (protocol downgrade chain).
14. Links to routes that no longer exist are soft 404s — repoint them.

**Page tags**
15. One `<title>`, description, canonical, robots per page; dedupe template vs
    Helmet tags (last wins).
16. Page-level props outrank the API's per-item `seo` block — so on detail pages
    pass props **only as a fallback**, led by the item's name. Constants there
    create sitewide duplicate descriptions.
17. Static-page metas live in dedicated i18n `seo` keys, never the visible hero copy.
18. Strip HTML from any API text that feeds a meta tag or JSON-LD.
19. OG image absolute, 1200×630, and existing. `og:locale` is `ll_TT`.

**Structured data**
20. One Organization node, one `@id`, site-wide. No second one in index.html.
21. No hardcoded ratings/reviews. No Course/Product nodes on pages that don't
    show one. No single price when prices vary by country.
22. Schema on a noindex page is never read — attach actions (Register) to the Org.
23. JSON-LD description comes from the same value as the meta description.

**Sitemap / robots / llms.txt**
24. Static routes are listed by hand and kept in sync with the pre-render list.
25. A crawler obeys only its most specific robots group — repeat every rule in
    `*`, `Googlebot` and the AI-answer group. **Never block JS, CSS or
    `/assets/`**: Google won't render with blocked files and Semrush warns.
    Keep assets out of the index with `X-Robots-Tag: noindex` on `/assets/*`.
26. Allow AI answer bots (cited in ChatGPT/Perplexity/Claude search); block
    training scrapers if the client wants. Publish `llms.txt`.
27. The PWA service worker must not serve the app shell for `/robots.txt`,
    `/sitemap.xml`, `/llms.txt` (`navigateFallbackDenylist`).

**hreflang**
28. Alternates only when the server returns a **different document per
    language**. `?lang=en` returning the same file is duplicate content and
    invalidates the cluster. Until then: self-referencing pair (`lang` + `x-default`).
29. Never declare two codes (`ar` + `ar-SA`) for one URL; match `<html lang>`.
30. Check the content exists in the language first — often the API returns
    source-language text for every locale.

**Serving / CDN / deploy**
31. Change the config production runs; mirror others for parity only.
32. HTML `no-cache`; hashed assets `immutable`; SEO files ~1 h. Non-overlapping matchers.
33. Write generated server config in the **start** command, not a build phase.
34. "My change didn't ship" → check for a cached deploy image before re-debugging.
34b. Renaming a public route (`/shop` → `/products`): 301 the old path, update
    every internal link, the sitemap, `llms.txt` and the pre-render list together.
34c. www → apex needs the proxy to forward the original `Host` header and a TLS
    certificate that covers `www` (add it to the platform's domains), or the
    redirect never gets a chance to run.
35. Cloudflare: Email Obfuscation turns mailto/plain emails into 404 links (wrap
    `<body>` in `<!--email_off-->`); Browser Cache TTL overrides `max-age`;
    it may answer http/www redirects itself (make them 301 there).
36. Build containers OOM: skip build-time compression/visualizers in CI when
    the server compresses at runtime; recycle Chrome during pre-render.

**Performance and on-page quality**
37. Baked preload hints compete with render-blocking CSS: keep only the render
    chain. A component shared by two pages becomes its own chunk — add it.
38. Keep the app shell and router as static imports if every page needs them.
39. Don't group all icons/charts into one vendor chunk; pin tiny shared deps
    (prop-types) to an eager chunk.
40. WebP/AVIF images with width/height, WOFF2 fonts, `fetchpriority="high"` on
    the LCP image, ≤ 4 preconnects, analytics on `requestIdleCallback`.
41. One h1, no skipped heading levels, unique descriptive alts (decorative
    `alt=""`), contrast ≥ 4.5:1, loaders reserve height (CLS).

**PageSpeed 100** (details: [pagespeed-100.md](references/pagespeed-100.md))
42. Mobile targets for a 100: TBT ≤ 80 ms, LCP ≤ 1.7 s, CLS ≤ 0.047,
    FCP ≤ 1.19 s, SI ≤ 2.19 s. Read the median of 3 runs on the canonical URL.
43. Idle-loaded analytics still run during the test: third-party cookies
    (Clarity, Pixel, YouTube) cap Best Practices at ~77–90. Gate them on
    consent or first interaction, use facades, turn off CDN auto-injected beacons.
44. Render-blocking CSS is usually the largest FCP cost on pre-rendered pages:
    inline critical CSS, load the rest async.
45. Accessibility/Best Practices/SEO are pass/fail lists: zero console errors,
    empty Issues panel, zoomable viewport, one `<main>`, 24 px targets, named
    icon buttons/links, descriptive link text, real `href`s, valid robots.txt.
46. Never serve Lighthouse different content (cloaking); fix the page.

**Semrush Site Audit** (full map: [semrush-checks.md](references/semrush-checks.md))
47. Semrush also warns on heuristics: text-HTML ratio ≤ 10 %, < 200 words,
    title > 70 chars. Lean markup helps, but thin pages clear only with real
    content. Report these to the client as content items; never pad pages.
48. h1 ≠ title (the title adds brand/keyword), exactly one h1, no underscores in
    URLs, 301 not 302/307, `Sitemap:` in robots.txt, a valid `llms.txt`
    (`# Title`, `> summary`, links).

## Setting up the SPA pipeline (Vite example)

```bash
S=<this skill's base directory>/templates   # plugin cache or ~/.claude/skills/seo-allgreen
cp $S/seo.config.mjs .
mkdir -p scripts src/utils && cp $S/scripts/*.mjs scripts/ && cp $S/src/utils/*.js src/utils/
cp $S/src/components/SEOManager.jsx src/components/
cp $S/tools/*.mjs scripts/            # copy — CI and teammates have no ~/.claude
npm i -D puppeteer-core && npm i react-helmet-async
echo "scripts/dynamic-routes.json" >> .gitignore
# package.json
#   "build:static": "vite build && node scripts/generate-seo-routes.mjs && node scripts/prerender.mjs"
#   "seo:verify":   "node scripts/verify-dist.mjs dist"
#   "seo:audit":    "node scripts/seo-audit.mjs https://example.com"
```

Also apply the snippets in `templates/snippets/`: `vite.config.snippet.js`
(CI build without OOM, service-worker denylist, chunk splitting), `main.snippet.jsx`
(mount over pre-rendered HTML without a black screen), `index.idle-analytics.html`
(analytics off the critical path).

Then: fill `seo.config.mjs` (origin, static routes, API sources, render chain);
render `<SEOManager>` on every public page; copy `public/` templates and edit;
pick a server template; set the SPA fallback to `/app.html`; run
`npm run build:static && npm run seo:verify`; run the server locally and curl
`/page`, `/page/`, a bare dir, a nonexistent path (see playbook § Serving).

Adapting to Next.js / Nuxt / Astro / other hosts: [playbook § Stacks](references/playbook.md#stacks).

## Triage map (report says → usual cause)

| Report | Usual cause | Fix |
|---|---|---|
| Broken canonical / non-canonical page in sitemap / no self-referencing hreflang | canonical from API, or slash mismatch | law 10–11 |
| Sitemap URL redirects | slash-less `<loc>` | law 10 |
| Broken internal link on every page | Cloudflare email obfuscation, or a global nav/footer link | law 35 / 14 |
| Pages with one internal link / orphans | JS-only navigation | real `<a href>` |
| 4xx on `/section/` | bare route directory | law 5 |
| Duplicate title/description | props overriding per-item SEO, or unrendered pages sharing the shell | law 16, 4 |
| Soft 404 / "Discovered – not indexed" | links to dead routes; fallback is homepage | law 14, 4 |
| hreflang conflicts / multiple languages per URL | extra codes; alternates to same file | law 28–29 |
| Invalid structured-data items | schema on wrong pages, placeholders, missing required fields | law 20–23 |
| Protocol-downgrade redirect chain | relative Location behind proxy | law 13 |
| Page indexed with empty content | not pre-rendered / snapshot of spinner | law 1–2 |
| robots.txt / sitemap 404 in browser only | service worker fallback | law 27 |
| Slow FCP/LCP on mobile | preload hints, big images/fonts, eager analytics | law 37–40 |
| Blocked internal resources in robots.txt | JS/CSS/assets disallowed | law 25 |
| Low text-HTML ratio / low word count | injected CSS, heavy markup, thin content | law 8, 47 |
| Duplicate H1 and title / no h1 | page heading reused as title | law 48, 41 |
| Error text ("An error occurred") in static HTML | API failed during pre-render | law 8 |

## Done means

- `verify-dist.mjs` exits 0 on the real build (not the dev server).
- Local server: `/x` → one 301 to `https://…/x/`; `/x/` 200; bare dir 200 shell;
  unknown path → noindex shell; cache headers as designed.
- Post-deploy `seo-audit.mjs` has no errors that trace to this repo.
- `pagespeed.mjs --both --runs 3`: every remaining failing audit is either fixed
  or listed with its reason (usually a third party the client chose to keep).
- Semrush: zero errors from code/config; remaining warnings are the
  content/hosting items in [semrush-checks.md § What can't be guaranteed](references/semrush-checks.md#what-cant-be-guaranteed).

**What to promise a client.** All code and config issues fixed, and a written list
for the rest. Not "100 on every test, guaranteed": PageSpeed Performance on
mobile depends on third parties the client keeps, and some Semrush warnings
depend on content they write.
- Out-of-repo items (CDN, DNS, backend content, admin fields) are listed for the
  client/owner rather than silently skipped.
