/**
 * The single source of truth for the canonical URL SHAPE: origin + path + "/".
 *
 * Why a trailing slash: pre-rendered pages are directories (dist/blog/index.html),
 * so /blog/ is the URL that answers 200 and /blog only 301s to it. Canonical,
 * og:url, hreflang, sitemap <loc>, JSON-LD `url` and internal links must ALL name
 * the URL that answers 200 — publishing /blog while serving /blog/ produced
 * "no self-referencing hreflang" and "redirect in sitemap" audit errors.
 *
 * (If your server serves /blog as 200 and redirects /blog/ instead, flip this —
 * the rule is "publish exactly what answers 200", not "always slash".)
 *
 * Dependency-free: import it from the app AND from the Node sitemap script so
 * the two can never drift. Router `path:` definitions do NOT carry the slash.
 */

/**
 * A last segment with an extension is a file (/sitemap.xml, /logo.png) and never
 * gains a slash. Trade-off: a slug ending in something extension-shaped
 * (/blog/vue.js) is treated as a file. Widen if your slugs look like that.
 */
const looksLikeFile = (pathname) => /\.[a-zA-Z0-9]+$/.test(pathname);

export const withTrailingSlash = (pathname) => {
  if (!pathname) return "/";
  if (pathname.endsWith("/")) return pathname;
  if (looksLikeFile(pathname)) return pathname;
  return `${pathname}/`;
};

/**
 * Canonicalise a full URL: drop the fragment, drop every query param except the
 * declared language param, force the trailing slash.
 *
 * Queries are dropped because robots.txt usually disallows `/*?*`; a canonical
 * with `?utm_source=` would point engines at an uncrawlable URL.
 */
export const canonicalizeUrl = (input, { keepParams = ["lang"] } = {}) => {
  if (!input) return "";
  try {
    const url = new URL(input);
    url.hash = "";
    const kept = new URLSearchParams();
    for (const key of keepParams) {
      const v = url.searchParams.get(key);
      if (v) kept.set(key, v);
    }
    url.search = kept.toString() ? `?${kept}` : "";
    url.pathname = withTrailingSlash(url.pathname);
    return url.toString();
  } catch {
    return input;
  }
};

export default canonicalizeUrl;
