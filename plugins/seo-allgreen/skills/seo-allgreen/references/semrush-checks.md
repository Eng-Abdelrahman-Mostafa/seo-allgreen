# Semrush Site Audit — every check, mapped

Source: Semrush KB "What Issues Can Site Audit Identify?"
(https://www.semrush.com/kb/542-site-audit-issues-list), checked 2026-09-27.
Thresholds come from Semrush's own issue descriptions where published.
Errors weigh most in the Health Score; warnings less; **notices don't affect it**.

Column **Tool**: `A` = `seo-audit.mjs` (live), `V` = `verify-dist.mjs` (build),
`—` = needs Semrush / manual check. Column **Law** = SKILL.md law number.

## Errors

| Issue | Fix | Law | Tool |
|---|---|---|---|
| Hreflang conflicts within page source code | Self-referencing pair only; one code per URL | 28–29 | A |
| Pages returning 5XX | Backend/hosting; readiness gate stops baking 5xx pages | 2 | A |
| Pages don't have title tags | SEOManager on every page | 15 | A V |
| Duplicate title tags | Per-item `seo` data; unique static titles | 16–17 | A V |
| Duplicate content | Canonicals; noindex fallback shell (not homepage) | 4, 11 | A V |
| Broken internal links | Dead-route links, Cloudflare email links, slash form | 14, 35 | A |
| Pages couldn't be crawled (+ DNS, URL format) | Hosting/DNS; valid hrefs | — | A |
| Broken internal images | Remove references to missing files | 40 | A |
| Duplicate meta descriptions | Props only as fallback on detail pages | 16 | A V |
| Format errors in robots.txt | Template; no invented directives | 25 | A |
| Format errors in sitemap.xml | Generator writes valid XML, escaped `<loc>` | 6 | V |
| Incorrect pages found in sitemap.xml | Only rendered, indexable, 200, slash-form URLs | 6, 10 | A V |
| WWW resolve issue | 301 www→apex (CDN or server) | 13 | A |
| No viewport tag / missing viewport width | `width=device-width, initial-scale=1` | 45 | A V |
| Size of HTML too large (> 2 MB) | Strip injected library CSS; no inline data blobs | 8 | A V |
| AMP pages with no canonical / AMP issues | Not used by the templates (no AMP) | — | — |
| Issues with hreflang values / incorrect hreflang links | Valid codes, absolute URLs that answer 200 | 28 | A |
| Pages returning 4XX | Fix or remove links; bare dirs get the shell | 5, 14 | A |
| Non-secure pages | HTTPS only | 13 | A |
| Expiring/expired cert, old protocol, wrong cert name, no secure algorithms | Hosting/CDN TLS (TLS 1.2+, cert covers www) | — | — |
| Mixed content | All subresources `https://` | 45 | A |
| No redirect/canonical to HTTPS homepage | 301 http→https | 13 | A |
| Redirect chains and loops | One absolute 301; internal links use final URLs | 13 | A |
| Broken canonical link / multiple canonicals | Canonical from served path; one tag (dedupe) | 11, 15 | A V |
| Meta refresh tag | Never | — | A V |
| Broken internal JavaScript and CSS files | Deploy atomically; HTML `no-cache` so it never points at deleted chunks | 32 | — |
| Sitemap.xml too large (> 50 MB / 50,000 URLs) | Split into a sitemap index | — | — |
| Pages with slow load speed | Pre-render, CDN, small HTML (Semrush times the HTML response) | 37–44 | — |
| Invalid structured data items | Graph rules; no placeholder nodes | 20–23 | — (Rich Results Test) |
| Malformed links | Valid `href`s, no `javascript:` | 45 | A |

## Warnings

| Issue | Fix | Law | Tool |
|---|---|---|---|
| Too much text in title (> 70 chars) / not enough | 30–60 chars; brand at the end | 15 | A V |
| **Low text-HTML ratio (≤ 10 %)** | See [the honest part](#what-cant-be-guaranteed) | 47 | A V |
| Pages without meta descriptions | SEOManager | 15 | A V |
| Duplicate H1 and title | h1 = on-page headline, title = headline + brand/keyword | 48 | A V |
| Pages without an h1 | Exactly one h1 per page | 41 | A V |
| Underscore in the URL | Hyphens in routes/slugs | — | A V |
| Sitemap.xml not indicated in robots.txt | `Sitemap:` line | 25 | A |
| **Low word count (< 200)** | Real content on hub pages (intro copy, FAQs) | 47 | A V |
| Temporary redirects (302/307) | 301 everywhere (CDN rules too) | 13 | A |
| Images without alt | Descriptive alts; decorative `alt=""` | 41 | A |
| Broken external images/links | Monitor; fix or remove | — | — |
| Too many URL parameters (> 4) | Clean routes; canonical drops params | 12 | — |
| No hreflang and lang attributes | `<html lang>` always; hreflang pair | 29 | V |
| No character encoding / no doctype | `<!DOCTYPE html>`, `<meta charset="utf-8">` first | 45 | V |
| Incompatible plugin content, frames | No Flash/`<frame>`; titled iframes | — | V |
| Internal links with nofollow | Never nofollow internal links | — | V |
| Too many on-page links (> 3,000) | Paginate mega-menus/lists | — | V |
| Sitemap.xml not found | Serve it; SW denylist | 27 | A |
| Subdomains don't support SNI | Hosting | — | — |
| Homepage not HTTPS; HTTP URLs in sitemap; links to HTTP pages | HTTPS everywhere, slash-form `https` URLs | 10, 13 | A V |
| Uncompressed pages; uncompressed JS/CSS | gzip/zstd/brotli at server/CDN | 32 | — |
| Uncached JS/CSS | `immutable` on hashed assets | 32 | — |
| JS + CSS total > 2 MB; > 100 JS/CSS files | Per-library chunks, route splitting | 37–39 | — |
| Unminified JS/CSS | Production build (Vite minifies) | — | — |
| **Blocked internal resources in robots.txt** | Don't block JS/CSS/assets; use `X-Robots-Tag: noindex` on assets | 25 | A |
| Too long link URLs | Short slugs | — | V |
| Llms.txt not found / formatting issues | llmstxt.org format: `# Title`, `> summary`, link lists | 26 | A |
| Too much content (AI search) | Don't make one page hold everything; split long pages | — | — |
| Outdated content (Last-Modified > 6 months) | Redeploy regularly (Caddy sends file mtime); update content | — | A |
| Low semantic HTML usage | `<header> <nav> <main> <article> <section> <footer>`, real lists and headings | 45 | — |
| Content not optimized (AI search) | Clear headings, direct answers, FAQ sections | — | — |

## Notices (don't affect Health Score)

| Issue | Fix | Tool |
|---|---|---|
| Only one incoming internal link; orphaned pages; > 3 clicks deep | Real `<a href>` nav, footer hubs, related links | A |
| Non-descriptive anchor text / no anchor text | Descriptive link text or `aria-label` | — |
| External links nofollow; external 403 | Review | — |
| Subdomains don't support HSTS | `Strict-Transport-Security` at the CDN | A |
| URLs > 200 characters | Short slugs | A V |
| More than one H1 | One h1 | A V |
| Robots.txt not found; blocked from crawling; X-Robots-Tag noindex on pages | Serve robots.txt; noindex only what should be | A |
| Hreflang language mismatch | `<html lang>` = hreflang = content language | A |
| Blocked / broken external resources | Review third parties | — |
| URLs with a permanent redirect | Link to final URLs (slash form) | A |
| Resources formatted as page link | Don't link to `.js`/`.css`/`.json` from `<a>` | — |

## What can't be guaranteed

The skill closes every issue that comes from **code and configuration**. Some
Semrush checks depend on content or on things outside the repo, and no code
change can promise to clear them:

1. **Low text-HTML ratio (≤ 10 %).** Measured on the case-study build: 62/63
   pre-rendered pages were ≤ 10 %. Stripping injected library CSS, junk metas,
   inline scripts and inline SVGs **and** minifying moved the median only from
   2.3 % to 7 % (51/63 still ≤ 10 %). The rest is utility-class markup
   (Tailwind) versus short pages. Google says this ratio "makes absolutely no
   sense at all for SEO" and isn't a ranking factor (John Mueller), so treat it as a
   Semrush-only warning. It clears when pages have real content (≥ 300–500 words
   on hubs) and lean markup. Don't pad pages with filler to game it.
2. **Low word count (< 200)** on listing, contact, legal-index or thin detail
   pages. Clears only with content the client writes.
3. **Slow load speed, outdated content, too much content, content not
   optimized** — content and hosting, measured from Semrush's crawler.
4. **Certificates, SNI, HSTS, www/http redirect codes** — CDN or hosting.
5. **Broken external links/images** — other people's sites.
6. **Semrush's crawler settings** (JS rendering on/off, user agent, crawl
   limits) change what it sees; the pre-render makes both modes see the same content.

So the claim you can make: **zero errors from code/config, and warnings reduced
to content-driven items with a written list for the client**. Not "100 %
health guaranteed".
