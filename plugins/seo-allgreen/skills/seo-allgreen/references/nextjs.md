# Next.js

Next.js renders HTML on the server, so the SPA pre-render pipeline isn't
needed. Everything else in SKILL.md still applies: URL shape, canonicals,
per-item metadata, structured data, sitemap, robots, hreflang, CDN,
PageSpeed and Semrush. This file maps each rule to Next.js.

Templates: `templates/nextjs/`. **Tested by building and serving a fresh
Next.js 16.3.6 app** (App Router, TypeScript) and curling every case below.

## Contents
- [Setup](#setup)
- [URL shape and redirects](#url-shape-and-redirects)
- [Metadata](#metadata)
- [Status codes and streaming](#status-codes-and-streaming)
- [Structured data](#structured-data)
- [Sitemap, robots, llms.txt](#sitemap-robots-llmstxt)
- [Images, fonts, scripts](#images-fonts-scripts)
- [JavaScript weight and TBT](#javascript-weight-and-tbt)
- [Languages](#languages)
- [Static export and hosting](#static-export-and-hosting)
- [Pages Router](#pages-router)
- [Verify](#verify)

## Setup

```bash
T=<this skill's base directory>/templates/nextjs
cp -n $T/next.config.ts .            # or merge into yours
mkdir -p lib components app/llms.txt
cp $T/lib/seo.ts lib/ && cp $T/components/*.tsx components/
cp $T/app/sitemap.ts $T/app/robots.ts app/ && cp $T/app/llms.txt/route.ts app/llms.txt/
# merge $T/app/layout.tsx into app/layout.tsx; use $T/app/blog/[slug]/page.tsx as the detail-page pattern
```

Then edit `SITE` in `lib/seo.ts`, the routes in `app/sitemap.ts`, and the
loaders in `components/DeferredAnalytics.tsx`. Delete `public/robots.txt` or
`public/sitemap.xml` if present — they conflict with the route files.

| File | What it does |
|---|---|
| `next.config.ts` | `trailingSlash`, image formats, `X-Robots-Tag` on `/_next/static`, redirects, `htmlLimitedBots` note |
| `lib/seo.ts` | `SITE`, `canonicalPath()`, `absoluteUrl()`, `pageMetadata()`, `plainText()` |
| `app/layout.tsx` | `metadataBase`, `title.template`, `<html lang>`, one Organization graph, semantic landmarks |
| `components/JsonLd.tsx` | Escaped JSON-LD `<script>`, Organization/WebSite, BlogPosting, BreadcrumbList |
| `components/DeferredAnalytics.tsx` | Analytics on first interaction (keeps cookies/JS out of Lighthouse) |
| `app/blog/[slug]/page.tsx` | `generateStaticParams`, name-led `generateMetadata`, `notFound()` before streaming, `<Image preload>` |
| `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt/route.ts` | Discovery files, all static at build |

## URL shape and redirects

- Pick `trailingSlash: true` or `false` once. With `true`, `/blog` → **308**
  `/blog/`, and the Metadata API appends the slash to relative canonicals and
  alternates automatically (not to files, queries or external URLs). Build every
  link, sitemap URL and JSON-LD `url` with `canonicalPath()` so they all agree.
- Next's redirect `Location` is **relative** (`/blog/hello/`). Browsers and
  crawlers resolve it against the requested https URL, which is fine. But curl the
  live site through the CDN to confirm it's a single hop that stays on https.
- Renamed routes: `redirects()` with `permanent: true` (308), and update links,
  sitemap and llms.txt in the same change.
- Internal links: `<Link href>` (renders a real `<a href>`). Never
  `onClick={() => router.push()}` for navigation.

## Metadata

- Root layout: `metadataBase: new URL(origin)` (makes canonical/og:image
  absolute) and `title: { default, template: "%s | Brand" }`. The template also
  keeps the h1 different from the `<title>` (Semrush "duplicate H1 and title").
- Every page: `alternates.canonical` built from the page's **own path**
  (`pageMetadata({ path })`). Never from an API's `canonical_url`.
- Detail pages: `generateMetadata` returns item-specific title/description led
  by the item name. Strip HTML from API text (`plainText()`) — a raw `<p>` in a
  description is a Semrush error and looks broken in results.
- `params` is a `Promise` in Next 15+: `const { slug } = await params`.
- One `<h1>` per page; `<html lang>` (and `dir="rtl"` for RTL languages).
- **Streaming metadata:** on dynamic pages, metadata streams after the shell for
  browsers. Bots matched by `htmlLimitedBots` get it blocking in `<head>`.
  Prerendered pages (static/SSG) don't stream. If an SEO crawler reports
  missing titles on dynamic pages, add its user agent to `htmlLimitedBots`
  (or `/.*/` to turn streaming metadata off).

## Status codes and streaming

This is the Next.js equivalent of the SPA "noindex shell" rule:

- Call `notFound()` **before any `await` inside a `<Suspense>` boundary or a
  `loading.tsx`**, so the response is a real **404** (verified: 404 +
  `<meta name="robots" content="noindex">`).
- Once streaming has started, the status is already **200**. `notFound()` can
  then only inject `noindex` (a soft 404 in audits), and `redirect()` becomes a
  client-side redirect that crawlers may not follow. Do existence checks and
  redirects before streaming, or in `proxy.ts`/middleware.
- `generateStaticParams` for every published item. Pages built at build time don't
  stream, so they get fast TTFB and metadata in `<head>`. Use
  `dynamicParams = false` if unknown slugs should always 404.

## Structured data

- There's no Metadata API field for JSON-LD. Render
  `<script type="application/ld+json">` in a Server Component, and escape `<`
  (`JSON.stringify(data).replace(/</g, "\\u003c")`), as the official docs do.
- One Organization + WebSite graph in the root layout; page nodes reference it by `@id`.
- All `structuredData.js` rules apply (no placeholder Course/Product nodes, no
  hardcoded ratings, no single price for country-priced offers).

## Sitemap, robots, llms.txt

- `app/sitemap.ts` returns `MetadataRoute.Sitemap`. List only published, indexable
  URLs, from the same source as `generateStaticParams`. Above 50,000 URLs, use
  `generateSitemaps()`.
- `app/robots.ts`: repeat the private-area rules in every user-agent group.
  **Don't disallow `/_next/`**: Google renders with those files. Use
  `X-Robots-Tag: noindex` on `/_next/static/*` instead (in `next.config.ts`).
- `app/llms.txt/route.ts`: a static route handler in llmstxt.org format.
- Remove conflicting `public/robots.txt` / `public/sitemap.xml`.

## Images, fonts, scripts

- **LCP image:** `<Image preload />`. **`priority` is deprecated in Next 16**
  (use `priority` only on ≤ 15; using both throws). Set `width`/`height` (or `fill`
  with a sized parent) and a real `sizes`. Never `loading="lazy"` on the LCP image.
  Verified output: a `<link rel="preload" as="image" imageSrcSet=…>` in `<head>`.
- `images.formats: ["image/avif", "image/webp"]`; configure `remotePatterns` for API images.
- **Fonts:** `next/font` self-hosts, subsets and adds fallback metric overrides
  (less CLS). Subset to the scripts you use (e.g. `subsets: ["arabic", "latin"]`).
- **Third-party scripts:** `next/script` strategies are `beforeInteractive`,
  `afterInteractive` (default), `lazyOnload` (idle) and `worker` (experimental,
  Partytown). **`lazyOnload` and `afterInteractive` still run during a Lighthouse
  test**, so their cookies and JS still count. For Best Practices 100, gate
  cookie-setting analytics on consent or first interaction
  (`components/DeferredAnalytics.tsx`). `@next/third-parties/google` loads GTM after
  hydration, which is better than a raw tag, but it still runs during the test.

## JavaScript weight and TBT

- Keep `"use client"` at the leaves; data fetching and content in Server Components.
- `next/dynamic` for heavy client widgets (charts, editors, chat), and
  `ssr: false` **only** for widgets with no SEO content.
- The RSC payload is inlined into the HTML. Large props passed to client
  components are serialised into every page, which inflates HTML size and lowers
  the text-to-HTML ratio (a Semrush warning). Pass IDs and small objects, not
  whole API responses.
- `@next/bundle-analyzer` to find heavy client chunks. Check the unused-JS
  and legacy-JS items that `pagespeed.mjs` reports.

## Languages

- Real per-language documents: a `[locale]` segment (e.g. `next-intl`) that
  renders each language at its own URL. Only then emit
  `alternates.languages` + `x-default`. Every version must list all the others
  and itself, and the sitemap must match.
- Single language: omit `alternates.languages`. The canonical alone is correct.
- Don't serve different languages at one URL based on headers or cookies.

## Static export and hosting

- `output: "export"` writes `out/`. Use `trailingSlash: true` so routes become
  `out/<route>/index.html`, which `verify-dist.mjs out` can check. Export has no
  `redirects()`, `headers()` or middleware: do those in the server/CDN (the
  Caddy/nginx templates apply unchanged).
- `next start` behind a proxy: forward `Host`/`X-Forwarded-Proto`; cache
  `/_next/static/*` as immutable (Next sets this); let the CDN respect origin headers.
- Vercel: `trailingSlash` and `redirects()` work at the edge; make www → apex a 301/308
  in the domain settings.

## Pages Router

- `next/head` per page for title/description/canonical (build it from `router.asPath`
  without the query, or from the known path — never from an API).
- `getStaticProps` + `getStaticPaths` (`fallback: "blocking"` or `false`);
  return `{ notFound: true }` for a real 404.
- Sitemap/robots: a build script or `next-sitemap`, following the same rules.

## Verify

Against `next build && next start` (or the deployed site):

```bash
B=http://localhost:3000
curl -sI $B/blog/hello | grep -iE '^(HTTP|location)'     # 308 → /blog/hello/ (one hop)
curl -s  $B/blog/hello/ | grep -oE '<title>[^<]*|<link rel="canonical"[^>]*>|<meta name="description"[^>]*>'
curl -s -o /dev/null -w '%{http_code}\n' $B/blog/does-not-exist/   # 404, not 200
curl -s  $B/robots.txt; curl -s $B/sitemap.xml | grep -c '<loc>'; curl -s $B/llms.txt | head -3
curl -sI "$B$(curl -s $B/ | grep -oE '/_next/static/[^"]+\.js' | head -1)" | grep -i x-robots
node templates/tools/seo-audit.mjs https://your-deployed-site.com
node templates/tools/pagespeed.mjs https://your-deployed-site.com/ --both --runs 3
```
