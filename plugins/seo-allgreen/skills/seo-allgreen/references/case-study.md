# Case study — an Arabic-first education SPA

Anonymised record of the project this skill was built from. Every rule in
SKILL.md traces back to something below.

**The site.** Arabic-first (RTL) online education academy. React 18 + Vite SPA,
react-helmet-async, a Laravel API on a separate host, deployed by Coolify with
Nixpacks → Caddy, behind Cloudflare. About 14 static marketing pages and ~48
database-driven detail pages (courses, instructors, products).

**Timeline.** Three months, ~45 commits, driven by a client SEO brief, two
Semrush crawls, Search Console reports and Lighthouse audits.

## Outcomes

| Metric | Before | After |
|---|---|---|
| Crawlable pages | Empty SPA shell | 62–63 pre-rendered routes (14 static + ~48 detail) |
| Semrush site health | 67 %, 221 errors | the five root causes below fixed; remaining items were CDN/backend/content |
| Duplicate meta descriptions | 27 (9 course + 18 instructor pages) | 0 outside noindex shells |
| Invalid structured-data items | 25 Course items | 0 |
| First paint, throttled mobile | 3.66 s | 2.22 s |
| Speed Index | 6.2 s | 4.75 s |
| Homepage weight | 1.71 MB | 0.98 MB |
| Eager JS (homepage, gzip) | ~1.6 MB | ~340–400 KB |
| Homepage images | 10.7 MB | 0.67 MB |
| Lighthouse "unused JS" | 1,618 KB | ~80 KB |
| Detail-page CLS | 0.28 | 0.03–0.13 |
| http→https / www→apex | 307 / 302 | 301 / 301 (fixed at the CDN) |

Lighthouse 13 baseline afterwards (mobile, local): Performance 58,
Accessibility 100, Best Practices 77, SEO 100. What still blocked 100:
render-blocking CSS (~1.3 s), third-party cookies from session-recording
analytics (8 cookies), gtag and animation-library JS, three oversized images,
and the CDN's auto-injected analytics beacon.

## The five root causes behind the 67 % crawl

1. **Canonical taken from the API.** The backend's `canonical_url` pointed at
   another host, another path and even another id space. One bug produced four
   Semrush error classes on 28 pages: broken canonicals, non-canonical sitemap
   entries, no self-referencing hreflang, and broken internal links.
2. **Cloudflare email obfuscation.** Every page's footer `mailto:` became a
   `/cdn-cgi/l/email-protection` link that 404s for crawlers (39 broken links).
   Plain-text addresses were rewritten too, into links with no fragment at all.
3. **Links to removed routes.** Two old route patterns were commented out of
   the router but still linked from the home and profile pages → soft 404s and
   "Discovered – currently not indexed".
4. **`<button onClick={navigate}>` navigation.** With JS unavailable to the
   crawler, whole sections had zero inbound `<a href>` links.
5. **Bare route directories** (`/course/`, `/instructor/`) answered 403.

## What was built, in order

**Pre-rendering and serving**
- Headless-Chrome pre-render of public routes to `dist/<route>/index.html`;
  soft-fail; dedupe template vs Helmet tags; rewrite the local origin.
- Fixed a props mismatch (`description` vs `metaDescription`) that had forced
  every page onto the default description.
- Nixpacks config: Chromium from Nix (apt's is a broken snap shim); Caddy must
  **not** be listed in `nixPkgs` (Nixpacks injects its own; two copies collide
  and abort the build); Caddy on port 3000 because the container is non-root.
- `puppeteer-core` imported lazily so a missing dev dependency skips the
  pre-render instead of failing the build.
- HTML `no-cache` so a cached `index.html` never points at deleted chunks.
- Black screen on pre-rendered pages: a "loading" class hid `#root` while the
  splash it expected had been stripped. Only add it when a splash exists.
- Robots rules allowing AI answer bots and blocking training scrapers; `llms.txt`.
- The PWA service worker served the app shell for `/robots.txt` and
  `/sitemap.xml` navigations → humans saw a 404. Added a denylist.
- A public route was renamed for SEO (`/shop` → `/products`-style) with a
  redirect; it had then been forgotten in the sitemap and pre-render list.

**Structured data and dynamic routes**
- Per-page JSON-LD graphs from one module; one `#organization` node.
- Build-time discovery of detail routes from the API.
- Chrome crashed mid-run while the sitemap already listed every discovered URL
  → most detail URLs served the SPA shell. Sitemap now written from rendered
  routes only, flushed after each one; Chrome recycled every 12 routes.
- Build OOM on the VPS → skip build-time compression and the visualizer in CI.
- The default schema had a hardcoded `aggregateRating` and a `Course` node on
  every page → replaced with a clean WebSite + Organization graph.
- `RegisterAction` moved onto the Organization (the register page is noindex).
- The FAQ page became public and pre-rendered — then turned out to be missing
  from the hand-written sitemap.
- A trailing-slash fix was made in `nginx.conf`, which production doesn't use.
  It never shipped.

**Languages and URLs**
- Language list from the backend registry; direction from data; `?lang=`
  honoured on the client; routed tree keyed on language.
- Trailing-slash URL convention with one shared helper (app + sitemap).
- A Node build script silently used a retired API host (Node doesn't read
  `.env`) and discovered **zero** detail routes.
- The pre-render snapshotted on timers and wrote blank spinner pages as
  successes → readiness gate + per-route isolation.
- Unrendered URLs fell back to the pre-rendered homepage → noindex app shell.
- `ar` + `ar-SA` declared for one URL → three hreflang criticals; later,
  `?lang=en` alternates served the same Arabic file → removed. The backend had
  no English content at all (`available_locales: ["ar"]`).
- A code comment asserted crawler behaviour nobody had verified; it was retracted.

**Audit fixes and content**
- The five root causes above.
- The Caddyfile moved from a build phase to the start command; a stale Coolify
  image then hid the change for one deploy.
- 27 duplicate descriptions: explicit props outranked the backend's unique
  per-item SEO block. Render `seo`; props only as a name-led fallback.
- Course `offers` carries no price (plans are priced per country).
- Client meta sheet applied verbatim to 10 static pages; its slash-less
  canonical column ignored.
- Client keyword copy added as crawlable blocks; per-course copy keyed by id,
  because those texts were shared i18n constants, not backend fields.

**Speed**
- ~40 baked modulepreload hints competed with the render-blocking CSS → keep only
  the render chain (first paint 3.66 → 2.22 s).
- `App`/router as static imports; WOFF2 fonts; WebP images; no icon or chart
  vendor chunks (a tiny shared dependency had dragged a 151 KB chart library
  onto four pages).
- A component shared by two pages became its own chunk and lost its preload hint.

## Found in the final check against Semrush's full issue list

- robots.txt blocked `/*.js$` and `/*.css$` (from the client's original file)
  → Semrush "blocked internal resources", and Google can't render. Fix: unblock
  and send `X-Robots-Tag: noindex` on `/assets/*`.
- Every pre-rendered page carried **30.7 KB of a dialog library's CSS**, injected
  when the module was imported during render. Stripping it cut pages by 35–40 %.
- In one test render an API call failed and the app's **error dialog was saved
  into the HTML**. The pre-render now refuses pages showing error UI.
- Text-to-HTML ratio ≤ 10 % on 62/63 pages (median 2.3 %); < 200 words on 9.
  All markup fixes together reached a median of ~7 % — the rest needs content.
- A product's meta description contained raw HTML from the API; one page's h1
  equalled its title; one page had no h1; one article had two.

## Mistakes worth not repeating

- Fixing the config production doesn't run.
- Blaming the config when the platform reused a cached image.
- Writing the sitemap from discovered URLs instead of rendered ones.
- Snapshotting on timers instead of waiting for real content.
- Trusting a URL from the API for the canonical.
- Publishing hreflang alternates the server can't serve differently.
- Believing an audit tool's error before reproducing it with curl.
- Asserting crawler behaviour in comments without checking it.
