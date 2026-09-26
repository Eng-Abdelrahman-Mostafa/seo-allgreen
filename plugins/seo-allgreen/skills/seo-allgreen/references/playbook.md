# SEO All-Green — playbook

Detail behind each phase and law in SKILL.md.

## Contents
- [Discovery checklist](#discovery-checklist)
- [Pre-rendering an SPA](#pre-rendering-an-spa)
- [URL shape and canonicals](#url-shape-and-canonicals)
- [Page tags](#page-tags)
- [Structured data](#structured-data)
- [Sitemap, robots.txt, llms.txt](#sitemap-robotstxt-llmstxt)
- [Languages and hreflang](#languages-and-hreflang)
- [Serving](#serving)
- [CDN (Cloudflare)](#cdn-cloudflare)
- [Deploy platforms](#deploy-platforms)
- [Performance and Core Web Vitals](#performance-and-core-web-vitals)
- [On-page quality and accessibility](#on-page-quality-and-accessibility)
- [Content and client work](#content-and-client-work)
- [Stacks](#stacks)
- [Reporting](#reporting)

## Discovery checklist

```bash
curl -s https://site.com/ | grep -c '<h1'                 # 0 → SPA shell, needs pre-render/SSR
curl -s https://site.com/ | grep -oE '<title>[^<]*'
curl -sI http://site.com/ | grep -iE '^(HTTP|location)'   # want 301 → https
curl -sI https://www.site.com/ | grep -iE '^(HTTP|location)'
curl -sI https://site.com/blog | grep -iE '^(HTTP|location)'   # one hop? https?
curl -s  https://site.com/nonexistent-xyz/ | grep -o noindex  # soft-404 check
curl -sI https://site.com/robots.txt | grep -iE 'cache-control|content-type|server|cf-'
```

- Read the deploy platform's build log: which Dockerfile/buildpack/start command
  actually runs? Grep the repo for every server config (`nginx.conf`,
  `Caddyfile`, `nixpacks.toml`, `netlify.toml`, `vercel.json`, `_redirects`,
  `.htaccess`) and find out which one is live.
- Response headers reveal the CDN (`cf-ray`, `server: cloudflare`) and origin server.
- Check the API from the build environment's point of view: does the build-time
  env (not your laptop's `.env`) point at the live API?
- Ask for / export: Search Console coverage + enhancements, Semrush/Ahrefs site
  audit, the client's meta sheet, keyword list, schema sheet.

## Pre-rendering an SPA

Template: `templates/scripts/prerender.mjs` + `seo.config.mjs`. Pipeline:

```
vite build → generate-seo-routes.mjs (API → dynamic-routes.json) → prerender.mjs
```

What the prerender does, and why each step exists:

| Step | Why |
|---|---|
| Snapshot untouched `index.html` → `app.html` with noindex, **before** rendering `/` | Fallback for everything not rendered; the homepage as fallback made private and unknown URLs 200 copies of home |
| Local static server falls back to `app.html` | Rendering later routes from the rendered homepage leaks home content |
| `domcontentloaded` + wait for root children + **readiness gate** (SEO tag with `data-rh` + > 200 chars) | Pages that poll never reach network idle; spinners were written as successes |
| Redirect guard | Auth/feature gates would bake `/login` under the route |
| Record 5xx during render (⚠) | Page can pass the gate while its API-driven content is missing |
| `newPage()` inside try; relaunch Chrome on crash; recycle every N routes; per-route timeouts | One sick browser aborted 50 of 62 routes; OOM kills in small build containers |
| `cleanupInPage`: strip analytics scripts, trim modulepreload to render chain, reveal animation states, async Google Fonts, drop dead CSS, dedupe SEO tags | Eager analytics; 40 preload hints delaying first paint; blank until JS; duplicate robots metas |
| Rewrite `127.0.0.1:PORT` → production origin | Canonicals/og:url built from `window.location` |
| Wrap body in `<!--email_off-->` | Cloudflare email obfuscation 404s |
| Delete stale `.gz/.br` next to written files | `gzip_static`/`precompressed` would serve the old shell |
| Flush each rendered dynamic URL into the sitemap | Killed runs left a sitemap listing unrendered URLs |
| Fill bare dirs with the shell | 403s |
| Exit 0 always, loud summary | A flaky API must not break deploys, but humans must see it |

Client side:
- Mount with `createRoot` on pre-rendered pages (don't hydrate a highly dynamic
  app — mismatches blank the page). Don't clear `#root` manually; defer the mount
  one or two animation frames so the static HTML paints first.
- Only add a "loading" class that hides `#root` when a splash element exists.
- Keep app shell + router as static imports: as lazy chunks they add round trips
  during which the pre-rendered page is replaced by a splash.
- Lazy page components: their chunk names must be in `renderChain`.

Discovery (`generate-seo-routes.mjs`): read the API base from real env → `.env`
(Node doesn't load it) → default. Probe response shapes defensively. Only list
published items. It must not write the sitemap itself.

## URL shape and canonicals

- Decide from the server: a pre-rendered directory answers 200 at `/x/` → slash
  form. Everything published uses it; router `path:` definitions don't.
- `canonicalUrl.js` is imported by the app **and** the Node sitemap script.
- Internal links: `<Link to="/x/">`. Active-nav comparisons must be
  slash-insensitive.
- Canonical from `origin + location.pathname`. Keep only a declared language
  query param. Self-referencing by construction, in browser and pre-render alike.
- Files (`/logo.png`, `/sitemap.xml`) never gain a slash.

## Page tags

`templates/src/components/SEOManager.jsx`. Per page: title (≤ ~60 chars),
description (~150–160, unique), canonical, robots, OG (type, site_name, title,
description, absolute 1200×630 image, locale, url), Twitter card, JSON-LD,
hreflang pair.

Backend-driven per-item SEO (`seo` block with `meta_title`, `meta_description`,
`og_*`, `no_index`, `structured_data`): render it; props only as a fallback led
by the item name; ignore its `canonical_url` and `hreflang`. If the backend
computes `override ?? generated`, the client's copy belongs in the backend
overrides, not in frontend constants.

Static pages: dedicated i18n keys (`page.seo.title/description`) in every
language bundle (missing keys fall back to the default language silently).

Applying a client meta sheet: copy titles/descriptions verbatim (normalise
whitespace), ignore a "canonical" column that contradicts the URL convention and
any "keywords" column (no ranking value), note which rows are backend data.

## Structured data

`templates/src/utils/structuredData.js`. Per page type:

| Page | Graph |
|---|---|
| All | Organization (`#organization`: name, url, logo raster ≥112 px, image, sameAs, slogan, contactPoint, potentialAction) + WebSite (`#website`) |
| Home | + ItemList/OfferCatalog of real programmes (not Course nodes) |
| About / Contact / listing | AboutPage / ContactPage / CollectionPage + BreadcrumbList |
| Course detail | Course: name, description, provider, hasCourseInstance (courseMode, instructor), offers (category, price only if single), image; + breadcrumbs |
| Product | Product + Offer (+ aggregateRating only from real reviews) |
| Article | BlogPosting: headline, dates, author, publisher, image |
| Person | Person: name, jobTitle, image, worksFor |
| FAQ | FAQPage — only with real published Q&As |

Validate a rendered HTML file in the Rich Results Test / validator.schema.org.
Missing *recommended* fields are warnings (fine); wrong facts are penalties.

## Sitemap, robots.txt, llms.txt

- `public/sitemap.xml`: static routes by hand, slash form, only indexable
  public pages. Dynamic URLs appended at build from what rendered.
  No `xhtml:link` alternates unless real language documents exist (and then the
  `xmlns:xhtml` namespace must be declared).
- Keep your own build-time sitemap even if the backend offers one — the backend
  lists items the front end may not have rendered.
- `robots.txt`: see template. **Don't block JS/CSS/assets** — Google's docs:
  "Google Search won't render JavaScript from blocked files"; Semrush warns
  ("blocked internal resources"). If assets show up as indexed URLs, send
  `X-Robots-Tag: noindex` on `/assets/*` (server templates do). `Disallow: /*?*`
  + `Allow: /*?lang=`. Repeat rules per group. End with `Sitemap:`.
  (Old robots.txt files often block `/*.js$` — check and remove it.)
- AI bots — allow: OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User,
  Claude-User, Claude-SearchBot, Applebot. Block (training): GPTBot, CCBot,
  Google-Extended, anthropic-ai, ClaudeBot, Claude-Web, Applebot-Extended,
  Bytespider, Omgilibot, cohere-ai, FacebookBot, meta-externalagent.
- `llms.txt` (llmstxt.org): summary, offerings, main pages with slash URLs,
  contact, legal; served `text/plain; charset=utf-8`.
- Service worker: `workbox.navigateFallbackDenylist: [/^\/robots\.txt$/,
  /^\/sitemap\.xml$/, /^\/llms\.txt$/, /^\/api\//, /\.(?:xml|txt|pdf|json|webmanifest)$/i]`.

## Languages and hreflang

1. Does the content exist per language? Request an item with each
   `Accept-Language`; if names come back identical, there is no second version.
2. Does the server return a different document per language URL? A static
   pre-render is one file per path; `?lang=` doesn't change it.
3. Only if both: pre-render per language under a path prefix (`/en/...`, router
   `basename`), emit a full reciprocal cluster (every version lists all others and
   itself + x-default) in page tags **and** sitemap together.
4. Otherwise: self-referencing pair. `<html lang>` matches. `og:locale` `ll_TT`.
- Language lists come from data (backend registry), not literals; a build-time
  grep gate can forbid `"ar"`/`"en"` literals in language-deciding files. Working
  example: `templates/scripts/check-language-literals.mjs`
  (runs first in `build:static`; comment lines ignored; escape hatch
  `REGISTRY_UNAVAILABLE_FALLBACK` on the line).
- Honour `?lang=` on the client (seed i18n from it before localStorage; write it
  back on switch, cleared for the default) so shared links work.
- Key the routed tree on language so per-page data refetches on switch.

## Serving

Templates: `templates/server/Caddyfile`, `nginx.conf`, `nixpacks.toml`.

Required behaviour:

| Request | Response |
|---|---|
| `/x` (pre-rendered) | one 301 → `https://site/x/` |
| `/x/` | 200 rendered file |
| `/section/` (bare dir) | 200 noindex shell |
| `/unknown` | 200 noindex shell (or real 404) — never the homepage |
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/robots.txt` etc. | `public, max-age=3600` |
| HTML | `no-cache` |
| `www.` | 301 → apex |

Caddy: `try_files {path}/index.html {path} /app.html` (index first — a directory
counts as existing); explicit absolute `redir` for the slash; `encode gzip zstd`;
`auto_https off` behind a TLS proxy; `:{$PORT:3000}` for non-root containers.
nginx: `absolute_redirect off`, `try_files $uri/index.html $uri /app.html`
(not `$uri/`), explicit absolute rewrite for pre-rendered dirs.

Test locally — `validate` catches syntax, not loops:

```bash
caddy validate --config Caddyfile --adapter caddyfile
PORT=3999 caddy run --config Caddyfile --adapter caddyfile &
curl -sI localhost:3999/blog | grep -iE '^(HTTP|location)'   # 301 https://…/blog/
curl -sI localhost:3999/blog/ | head -1                       # 200
curl -so /dev/null -w '%{http_code}\n' localhost:3999/course/ # 200
curl -s localhost:3999/nope | grep -o noindex                 # noindex
curl -sI localhost:3999/robots.txt | grep -i cache-control
curl -sI -H 'Host: www.site.com' localhost:3999/ | grep -i location
```

## CDN (Cloudflare)

- Email Address Obfuscation (Scrape Shield) → `/cdn-cgi/l/email-protection#…`
  (mailto) and fragment-less links (plain text) → 404s for crawlers. Wrap body in
  `<!--email_off-->` or disable the feature. Only verifiable live.
- Browser Cache TTL overrides origin `max-age` and drops `immutable`; set
  *Respect Existing Headers* if it matters.
- "Always Use HTTPS" / redirect rules may answer http and www before your origin:
  make them 301 (were 307/302 on the case-study site until fixed there).
- Consider HSTS once https is stable.
- Purge cache after deploys that change HTML/redirects when testing.

## Deploy platforms

- Nixpacks/Coolify: Chromium via `nixPkgs`, `PUPPETEER_EXECUTABLE_PATH=$(command -v chromium)`;
  don't add `caddy` (auto-injected); write Caddyfile in `[start]`; port 3000;
  `NODE_OPTIONS=--max_old_space_size=4096`; `CI=true` is set — skip build-time
  compression/visualizer. Cached images can hide a changed start command for a
  deploy: look for "Build configuration changed. Rebuilding image."
- Docker: install Chromium in the build stage, run `build:static`, copy `dist/`
  into the server stage with the matching config.
- Netlify / Cloudflare Pages / Vercel static: they serve `/x/index.html` for `/x/`;
  configure the slash redirect (`_redirects`, `trailingSlash`) and the fallback to
  `/app.html` with status 200 — verify noindex on unknown URLs.
- `VITE_*` env must exist at build time (inlined).

## Performance and Core Web Vitals

Measure: median of 3 Lighthouse runs, mobile throttled, against the production
build served like production. Record first paint, LCP, Speed Index, TBT, CLS,
weight.

Proven wins (case study: first paint 3.66 → 2.22 s, weight 1.71 → 0.98 MB,
eager JS −75 %, homepage images 10.7 → 0.67 MB, LCP 50.9 s → ~12 s on the worst run):
- Split vendor chunks per library so only what's needed is eager; remove dead
  imports that pull a whole UI kit; lazy-load error dialogs.
- Don't lump icons/charts into single vendor chunks; pin small shared deps.
- Trim pre-rendered preload hints to the render chain.
- Images → WebP/AVIF sized to display, explicit width/height, LCP image
  preloaded with `fetchpriority="high"`; remove references to missing images.
- Fonts → WOFF2 (60–87 % smaller), no duplicate preloads, Google Fonts async.
- ≤ 4 preconnects; `dns-prefetch` for the rest.
- Analytics (Clarity, GTM, Pixel) on `requestIdleCallback` with `onerror` no-op.
- Defer service-worker registration.
- Loaders reserve `min-h-screen` on detail pages (CLS 0.28 → ≤ 0.13).
- Cache matrix as in Serving.

## On-page quality and accessibility

- One h1; h1 → h2 → h3 without skips (card titles are often wrong levels).
- Alts: descriptive, in the page language, unique; decorative → `alt=""
  aria-hidden="true"`; no one-word brand alts repeated on every logo.
- Contrast ≥ 4.5:1 for small text; tap targets ≥ 44×44.
- Crawlable nav and footer (`<a href>`); footer links reach every hub page.
- Keyword copy the client supplies: render it as real, pre-rendered HTML blocks
  (static import) where they asked; per-item copy keyed by id if the backend has
  no field for it — additive, defaults untouched.

## Content and client work

Split every request into: **repo** (code, templates, i18n), **backend/admin**
(item names, descriptions, per-item SEO overrides, FAQs, contacts), **platform**
(CDN, DNS, certificates). Deliver the second and third as a checklist to the owner.
Note deploy-order dependencies: backend changes the build reads must ship first,
because pre-rendering bakes whatever the API returns at build time.

## Stacks

| Stack | What changes |
|---|---|
| Vite / CRA / Vue CLI SPA | Everything here applies as-is |
| Next.js (App Router) | No prerender — use `generateMetadata`, `alternates.canonical`, `app/sitemap.ts`, `app/robots.ts`, `generateStaticParams`; `trailingSlash` in next.config; JSON-LD via `<script type="application/ld+json">` in the page. Canonical/sitemap/URL laws unchanged |
| Nuxt | `useSeoMeta`, `@nuxtjs/sitemap`, `routeRules` prerender; same laws |
| Astro / SSG | Pages are static already; set `trailingSlash`, `site`, `@astrojs/sitemap` |
| SSR with API data | Readiness is server-side: return 404 status for missing items instead of a shell |
| WordPress | Yoast/RankMath cover tags; still check CDN, redirects, duplicate canonicals |

Tools work on any stack: `seo-audit.mjs` takes a URL; `verify-dist.mjs` any
static output directory.

## Reporting

For each fix: the report's error class and count, the verified root cause, what
changed, where (file or platform), and the measured result. List what was
deliberately *not* done and its precondition (e.g. hreflang blocked on content).
