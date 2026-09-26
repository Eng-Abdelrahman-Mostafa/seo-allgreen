# PageSpeed 100 — all four scores

How to reach 100 in Performance, Accessibility, Best Practices and SEO on
https://pagespeed.web.dev/ (Lighthouse 13 — audit lists below were read from a
real Lighthouse 13.5 report, not from memory).

Measure with the tool, fix the highest-weight failure, and measure again:

```bash
node templates/tools/pagespeed.mjs https://site.com/ --both --runs 3   # PSI API (PSI_API_KEY for quota)
node templates/tools/pagespeed.mjs https://site.com/ --local           # same engine, local Chrome, no quota
node templates/tools/pagespeed.mjs http://localhost:3999/ --local      # a local build before deploying
```

## Contents
- [How the scores work](#how-the-scores-work)
- [Performance](#performance)
- [Third parties — the usual reason you're stuck at 70–90](#third-parties)
- [Accessibility](#accessibility)
- [Best Practices](#best-practices)
- [SEO](#seo)
- [SPA recipe](#spa-recipe)
- [Case study baseline](#case-study-baseline)
- [Checklist](#checklist)

## How the scores work

- **Accessibility, Best Practices, SEO** are weighted pass/fail lists. Every
  weighted audit must pass for 100. Audits that don't apply (no tables, no
  video) drop out.
- **Performance** is five lab metrics on log-normal curves:

| Metric | Weight | Mobile target for ~100 | Desktop target | "Good" (score 90) mobile |
|---|---|---|---|---|
| Total Blocking Time | 30 % | ≤ **80 ms** | ≤ 75 ms | 200 ms |
| Largest Contentful Paint | 25 % | ≤ **1.7 s** | ≤ 0.68 s | 2.5 s |
| Cumulative Layout Shift | 25 % | ≤ **0.047** | ≤ 0.047 | 0.1 |
| First Contentful Paint | 10 % | ≤ **1.19 s** | ≤ 0.60 s | 1.8 s |
| Speed Index | 10 % | ≤ **2.19 s** | ≤ 0.83 s | 3.4 s |

  Targets are the values where each metric scores 0.99 (computed from the
  Lighthouse curves: p10/median mobile FCP 1.8/3.0 s, LCP 2.5/4.0 s, SI 3.387/5.8 s,
  TBT 200/600 ms, CLS 0.1/0.25; desktop FCP 0.934/1.6 s, LCP 1.2/2.4 s,
  SI 1.311/2.3 s, TBT 150/350 ms). A category shows 100 when the weighted score is ≥ 0.995.
- **Mobile lab conditions:** emulated mid-range phone, simulated slow 4G
  (~150 ms RTT, ~1.6 Mbps), 4× CPU slowdown. Every KB and every round trip counts.
- **Lab ≠ field.** The "Discover what your real users are experiencing" box is
  CrUX field data at p75 (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1). It isn't part of
  the 0–100 score. TBT is the lab proxy for INP.
- **Variance** is ±5 points. Use `--runs 3` and read the median; don't chase single runs.
- **Test the canonical URL** (`https://site.com/`, `https://site.com/blog/`).
  A redirecting URL adds a round trip to FCP/LCP.
- **Don't game it.** Serving different content to Lighthouse (UA sniffing) risks
  a cloaking penalty and doesn't help real users.

## Performance

### FCP and Speed Index — get pixels on screen early
- **HTML contains the content** (SSR/pre-render). An SPA shell paints nothing until JS runs.
- **TTFB < ~200 ms:** static HTML from a CDN edge; cache HTML at the CDN with
  revalidation; no origin work per request. No redirects on the tested URL.
- **Render-blocking CSS is the #1 FCP cost** (a 25 KB CSS file cost 1.29 s on
  mobile in the case study). Inline the critical CSS and load the rest async:
  - Vite: `vite-plugin-beasties` / `beasties` (maintained successor of `critters`)
    inlines critical CSS; for pre-rendered pages run `beasties` over each
    `dist/**/index.html` after the prerender step, so it sees the real rendered DOM.
  - Remove unused CSS (Tailwind JIT content globs; drop dead stylesheets).
- **Fonts:** self-host WOFF2 (no extra origin), subset (Arabic + Latin only),
  `font-display: swap` (or `optional` for 0 layout shift), preload only the one
  font used above the fold, add fallback metric overrides (`size-adjust`,
  `ascent-override`) so the swap doesn't shift layout. Google Fonts CSS is
  render-blocking unless loaded async (print-media swap).
- **≤ 4 preconnects**, only to origins used in the first second.
- No `@import` in CSS, no synchronous `<script>` in `<head>`, `defer`/`type=module` everything.

### LCP — make the biggest element arrive first
- Find the LCP element (the tool prints the `lcp-breakdown-insight`; DevTools
  Performance panel). Usually the hero image or the h1.
- It must be **discoverable in the initial HTML**: an `<img>`, not a CSS
  `background-image` and not something rendered by JS (`lcp-discovery-insight`).
- `<link rel="preload" as="image" fetchpriority="high">` + `fetchpriority="high"`
  on the `<img>`. **Never `loading="lazy"` on the LCP image.**
- Right-sized: `srcset` + `sizes`, AVIF/WebP, ~≤ 50–100 KB on mobile. The
  `image-delivery-insight` lists the savings per image.
- Don't hide it: entrance animations starting at `opacity:0` delay LCP until
  JS runs. Text LCP waits for the web font, so use `swap`.
- A splash screen or client re-render that replaces pre-rendered HTML resets LCP.
- LCP breakdown: TTFB → resource load delay → load time → render delay. Fix the largest slice.

### TBT — less JavaScript on the main thread
- **Ship less JS on first load**: route-level code splitting, one vendor chunk
  per library, lazy-load below-the-fold sections (`React.lazy` + IntersectionObserver),
  no UI kits or animation libraries on the landing view if CSS can do it.
- `unused-javascript` / `duplicated-javascript-insight` / `legacy-javascript-insight`:
  target modern browsers (`build.target: "es2020"`, modern browserslist), no
  polyfills for features every browser has, dedupe versions.
- Break long tasks (> 50 ms): `scheduler.yield()` / `setTimeout` chunks; move
  heavy work to a Web Worker; defer non-critical providers and effects until after first paint.
- Hydration/`createRoot` of a big tree is one long task: render less on first
  paint, defer widgets (chat, support, modals) until idle or interaction.
- `forced-reflow-insight`: don't read layout (`offsetHeight`) right after writing styles in a loop.
- Third-party scripts are usually most of TBT (next section).

### CLS — nothing moves after paint
- `width`/`height` (or `aspect-ratio`) on every image, video, iframe and ad slot.
- Reserve space for async content: skeletons with fixed height, `min-height` on
  loaders of data-driven sections (course page CLS 0.28 → 0.03 in the case study).
- Font swaps with metric overrides (above). No banners or cookie bars injected
  above existing content — overlay them (`position: fixed`).
- Animate only `transform`/`opacity` (non-composited animations show up as a diagnostic).
- `cls-culprits-insight` names the shifting elements.

### Lighthouse 13 insights → fixes

| Insight | Fix |
|---|---|
| `render-blocking-insight` | Inline critical CSS, async the rest; defer scripts |
| `lcp-discovery-insight` | LCP image in HTML, preload + `fetchpriority=high`, not lazy |
| `lcp-breakdown-insight` | Shrink the largest phase (TTFB / load delay / load / render) |
| `image-delivery-insight` | AVIF/WebP, correct dimensions, `srcset`, compress |
| `document-latency-insight` | No redirect, fast TTFB, compression (brotli/zstd) |
| `cache-insight` | `immutable` long cache on hashed assets; third-party short TTLs → self-host or defer |
| `font-display-insight` | `font-display: swap/optional` |
| `network-dependency-tree-insight` | Flatten request chains; preload critical late-discovered resources |
| `third-parties-insight` | Defer/facade/remove (next section) |
| `legacy-javascript-insight` | Modern build target; drop polyfills |
| `duplicated-javascript-insight` | Dedupe dependency versions |
| `dom-size-insight` | Keep under ~1,400 nodes; virtualise long lists; `content-visibility: auto` |
| `forced-reflow-insight` | Batch DOM reads before writes |
| `modern-http-insight` | HTTP/2 or HTTP/3 (any CDN) |
| `viewport-insight` | `<meta name="viewport" content="width=device-width, initial-scale=1">` |
| `cls-culprits-insight` | Dimensions, reserved space, font metrics |
| `inp-breakdown-insight` | Short event handlers; yield before heavy work |

Also: **bfcache** — no `unload` listeners, and don't send `Cache-Control: no-store`
on HTML (`no-cache` is fine). A page that can't be restored from bfcache is
slower on back/forward navigation.

## Third parties

In practice the biggest obstacle to 100 on Performance **and** Best Practices.
Measured on the case-study homepage: Clarity + Bing set **8 third-party
cookies** (Best Practices 77), the Cloudflare Web Analytics beacon added legacy
JS and short cache TTLs, and gtag was the largest block of unused JS.

| Script | Costs | Options |
|---|---|---|
| Google Tag Manager / gtag | TBT, unused JS | Load on first interaction; server-side tagging; GA4 only what's needed |
| Microsoft Clarity | 3rd-party cookies (BP), TBT | Load after consent or first interaction; or drop on pages you don't analyse |
| Meta Pixel | 3rd-party cookies, TBT | After consent / interaction; Conversions API server-side |
| Cloudflare Web Analytics (auto-injected `beacon.min.js`) | legacy JS, cache TTL | Turn off automatic injection if you already have analytics |
| YouTube / Vimeo embeds | ~500 KB+ JS, cookies | Facade: thumbnail + play button, load iframe on click; `youtube-nocookie.com` |
| Chat / support widgets | TBT, JS | Load on click of a lightweight launcher, or on idle after `load` |
| Maps | JS, cookies | Static map image linking out |

Loading analytics on **first user interaction** (scroll, pointerdown, keydown)
keeps them out of Lighthouse, which never interacts. It's a legitimate pattern
(and what consent-gating does anyway), but it misses visitors who bounce
without interacting. Agree that trade-off with the client.

Pattern (index.html):

```html
<script>
  (function () {
    var done = false;
    function load() {
      if (done) return; done = true;
      ["scroll", "pointerdown", "keydown", "touchstart"].forEach(function (e) {
        removeEventListener(e, load, { passive: true });
      });
      var s = document.createElement("script");
      s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=G-XXXX";
      s.onerror = function () {};
      document.head.appendChild(s);
      // + gtag config / Clarity / Pixel loaders here
    }
    ["scroll", "pointerdown", "keydown", "touchstart"].forEach(function (e) {
      addEventListener(e, load, { once: true, passive: true });
    });
  })();
</script>
```

`requestIdleCallback` (used in the case study) takes analytics off the
critical path but **still runs during the Lighthouse test**, so cookies and
JS still count. Only interaction- or consent-gating removes them from the score.

## Accessibility

Weighted audits in Lighthouse 13 (weight in brackets) — all must pass:

| Audit | How to pass |
|---|---|
| `image-alt` [10] | Every `<img>` has `alt`; decorative → `alt=""` |
| `button-name` [10] | Icon buttons get `aria-label` (and in the page language) |
| `label` [10] | Every input has a `<label for>` or `aria-label` (placeholder is not a label) |
| `meta-viewport` [10] | No `user-scalable=no`, no `maximum-scale` < 5 |
| `aria-allowed-attr`, `aria-valid-attr`, `aria-valid-attr-value` [10 each] | Only real ARIA attributes/values allowed for the role |
| `aria-hidden-body` [10] | Never `aria-hidden` on `<body>` (some modal libs do — check) |
| `color-contrast` [7] | ≥ 4.5:1 normal text, ≥ 3:1 large (≥ 24px or 18.66px bold). Watch grey-on-white, text on images/gradients, disabled-looking CTAs |
| `link-name` [7] | Links have text or `aria-label` (icon-only social links!) |
| `document-title` [7], `html-has-lang` [7], `html-lang-valid` [7] | `<title>`; `<html lang="ar" dir="rtl">` with a valid code |
| `list` [7], `listitem` [7] | `<ul>/<ol>` contain only `<li>` (no stray `<div>`) |
| `tabindex` [7] | No positive `tabindex` |
| `target-size` [7] | Touch targets ≥ 24×24 CSS px or enough spacing (aim 44×44) |
| `aria-hidden-focus` [7] | No focusable elements inside `aria-hidden` (hidden carousels/slides: add `inert`) |
| `aria-conditional-attr`, `aria-prohibited-attr` [7] | Don't put e.g. `aria-label` on elements where it's prohibited (`<div>` without role) |
| `heading-order` [3] | h1 → h2 → h3, no skipped levels |
| `landmark-one-main` [3] | Exactly one `<main>` |

Conditional (score only when the element exists): `frame-title` (iframe
`title`), `select-name`, `input-button-name`, `input-image-alt`, `svg-img-alt`,
`video-caption`, `td-headers-attr`/`th-has-data-cells`, `definition-list`,
`duplicate-id-aria`, `aria-required-*`, `aria-*-name` for dialogs, tooltips,
progress bars etc., `link-in-text-block` (inline links distinguishable without
colour — underline them), `label-content-name-mismatch` (aria-label must contain
the visible text), `identical-links-same-purpose`, `empty-heading`,
`skip-link`, `bypass`, `meta-refresh`, `accesskeys`, `valid-lang`.

Carousels (Swiper etc.) are the most common failure: off-screen slides with
focusable links trip `aria-hidden-focus`; pagination bullets need
`aria-label`; the bullets fail `target-size`.

Lighthouse can't check everything (manual items: focus order, visible focus,
keyboard traps). A score of 100 doesn't mean the page is fully accessible.

## Best Practices

| Audit [weight] | How to pass |
|---|---|
| `is-on-https` [5] | HTTPS, and every subresource over HTTPS (no mixed content) |
| `third-party-cookies` [5] | No third-party cookies on load — see [Third parties](#third-parties). YouTube → nocookie + facade |
| `deprecations` [5] | No deprecated APIs: `unload` listeners, `document.domain`, sync XHR, old third-party SDKs. Update or defer the library that triggers it |
| `paste-preventing-inputs` [3] | Never block paste (password, OTP, email confirm) |
| `errors-in-console` [1] | Zero console errors on load: 404s (favicon, manifest icons, missing images), failed API calls, blocked third-party scripts (add `onerror`), React/prod warnings, CSP violations |
| `inspector-issues` [1] | DevTools Issues panel empty: usually cookie `SameSite` warnings (from third parties), mixed content, CSP/CORS issues |
| `image-aspect-ratio` [1] | Displayed aspect ratio matches the file (`object-fit: cover` on a fixed box) |
| `image-size-responsive` [1] | Serve enough pixels for DPR 2–3 (`srcset` with 2× candidates); logos are the usual offenders |
| `doctype` [1] | `<!DOCTYPE html>` first |
| `charset` [1] | `<meta charset="utf-8">` in the first 1024 bytes |
| `geolocation-on-start`, `notification-on-start` [1] | Only ask after a user action |

Unweighted but reported (good hygiene, often requested by security reviews):
`has-hsts`, `csp-xss`, `origin-isolation` (COOP), `clickjacking-mitigation`
(XFO / `frame-ancestors`), `trusted-types-xss`, `valid-source-maps`, `redirects-http`.

Beware "security" scripts: DevTools blockers, right-click disablers and console
overrides can log errors or use deprecated APIs. Check the console in a
production build.

## SEO

| Audit [weight] | How to pass |
|---|---|
| `is-crawlable` [~4] | No `noindex` meta/header, and robots.txt doesn't block the page for Googlebot. This alone drops SEO to ~60 |
| `document-title` [1], `meta-description` [1] | Present, non-empty (and unique across the site — Lighthouse only checks one page) |
| `http-status-code` [1] | Page answers 200 (not 404/500; test the canonical URL) |
| `link-text` [1] | No generic link text ("click here", "read more", "more", "learn more"); give each link descriptive text or an `aria-label` |
| `crawlable-anchors` [1] | Every `<a>` has a real `href` (no `javascript:void(0)`, no `href`-less anchors used as buttons — use `<button>`) |
| `robots-txt` [1] | robots.txt parses: known directives only, valid paths, `Sitemap:` absolute. Watch for platform-injected lines (e.g. a CDN's managed robots.txt adding non-standard directives) — if Lighthouse flags one, disable that injection or serve your own file |
| `image-alt` [1] | As in Accessibility |
| `hreflang` [1] | Valid language codes, absolute URLs |
| `canonical` [1] | One absolute canonical, same domain, not pointing to a different page (e.g. every page → home) |

The SEO category checks only the basics. Structured data, duplicate content and
internal linking are covered by the rest of this skill, not by the score.

## SPA recipe

For a React/Vite SPA the order that moved scores most in the case study:

1. **Pre-render** (skill § pre-rendering) → FCP/LCP from "after JS" to "first HTML".
2. **Trim baked modulepreload hints** to the render chain → first paint 3.66 → 2.22 s.
3. **Split vendor chunks per library; lazy routes** → eager JS −75 %.
4. **Images to WebP/AVIF, correct size, dimensions; LCP preload** → images 10.7 → 0.67 MB.
5. **Fonts to WOFF2, self-hosted, no duplicate preloads.**
6. **Mount with `createRoot` two frames after paint**; no splash over pre-rendered HTML.
7. **Loaders reserve height** → CLS < 0.05.
8. Next for 100: **inline critical CSS**, **interaction-gate analytics**,
   **disable auto-injected CDN beacons**, **defer global widgets** (chat,
   support, toasts) until idle/interaction, **CSS animations** instead of an
   animation library on the landing view.

## Case study baseline

The pre-rendered SPA from [case-study.md](case-study.md), after all the work
above, measured with `pagespeed.mjs --local` (Lighthouse 13.5, mobile):

| | Score | Notes |
|---|---|---|
| Performance | 58 | FCP 4.6 s, LCP 9.9 s, SI 7.5 s, TBT 99 ms, CLS 0.033 ✓ |
| Accessibility | 100 | |
| Best Practices | 77 | 8 third-party cookies (session-recording analytics); Issues panel: cookie warnings |
| SEO | 100 | |

Top remaining items: render-blocking CSS (~1.29 s), unused JS 128 KiB (gtag,
`vendor-utils`, `vendor-motion`), image delivery 120 KiB (hero, background and
video-thumbnail images), the CDN's analytics beacon (legacy JS,
cache TTL), unused CSS 29 KiB. Local runs are slower than PSI's servers; use
them for relative comparisons.

## Checklist

**Performance**
- [ ] Content in initial HTML (SSR / pre-render); no splash over it
- [ ] TTFB < 200 ms, no redirect on the tested URL, brotli/zstd, HTTP/2+
- [ ] Critical CSS inlined, rest async; no `@import`; unused CSS removed
- [ ] Fonts: self-hosted WOFF2, subset, swap/optional + metric overrides, one preload
- [ ] LCP element: `<img>` in HTML, preload + `fetchpriority=high`, not lazy, AVIF/WebP, sized
- [ ] All media has width/height; async sections reserve height; overlays don't push content
- [ ] First-load JS minimal: route splitting, per-library chunks, modern target, no dup libs
- [ ] Third parties: interaction/consent-gated or facades; CDN auto-beacons off
- [ ] Hashed assets `immutable`; HTML `no-cache` (not `no-store`); no `unload` handlers
- [ ] ≤ 4 preconnects; DOM < ~1,400 nodes; only transform/opacity animations

**Accessibility** — alts, labels, button/link names, contrast, lang+dir, viewport
zoom allowed, one `<main>`, heading order, list structure, target size ≥ 24 px,
nothing focusable inside `aria-hidden` (carousels → `inert`).

**Best Practices** — HTTPS everywhere, zero console errors, empty Issues panel,
no third-party cookies on load, no deprecated APIs, paste allowed, correct image
aspect/resolution, doctype, early charset, no permission prompts on load.

**SEO** — indexable, 200, title, description, descriptive link text, real
hrefs, valid robots.txt, alts, valid hreflang, valid canonical.
