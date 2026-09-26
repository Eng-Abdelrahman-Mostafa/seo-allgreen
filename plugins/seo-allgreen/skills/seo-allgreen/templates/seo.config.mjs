/**
 * seo.config.mjs — the ONLY file you edit per project.
 *
 * Copy to the project root. prerender.mjs and generate-seo-routes.mjs import it
 * (override the location with SEO_CONFIG=/path/to/seo.config.mjs).
 *
 * Every value here was a bug somewhere once; the comments say which.
 */
export default {
  /** Production origin, no trailing slash. Every canonical/sitemap URL uses it. */
  siteOrigin: "https://example.com",

  /** Build output directory (relative to the project root). */
  distDir: "dist",

  /**
   * Public, statically-known routes to pre-render. No auth, no feature gates.
   * A route that redirects while rendering (auth → /login) is skipped anyway.
   * Keep public/sitemap.xml in sync with this list BY HAND — the prerender only
   * appends dynamic routes to it.
   */
  staticRoutes: ["/", "/about", "/contact"],

  /**
   * Dynamic detail routes discovered from the API at build time.
   * Each source: { name, endpoint, paged, itemPaths, key: "id"|"slug", route }.
   * `route(item)` returns the path WITHOUT trailing slash; it is added for you.
   */
  api: {
    // Resolution order: SEO_API_URL → VITE_APP_API_URL (env) → same key in .env → this.
    // Plain Node does NOT read .env — forgetting that once meant ZERO dynamic routes.
    envKey: "VITE_APP_API_URL",
    fallback: "https://api.example.com/v1",
    timeoutMs: 20000,
    maxPages: 100,
    // Optional: endpoint returning the site's languages, e.g. "languages".
    languagesEndpoint: null,
    sources: [
      // { name: "products", endpoint: "products", paged: true,
      //   itemPaths: ["data.data", "data"], key: "id", route: (p) => `/product/${p.id}` },
      // { name: "posts", endpoint: "blog/posts", paged: true,
      //   itemPaths: ["data.data", "data"], key: "slug", route: (a) => `/blog/${a.slug}` },
    ],
  },

  /** Sitemap priority / changefreq by route prefix (first match wins). */
  sitemap: {
    rules: [
      { prefix: "/blog/", priority: "0.6", changefreq: "weekly" },
      { prefix: "/product/", priority: "0.6", changefreq: "monthly" },
    ],
    default: { priority: "0.5", changefreq: "monthly" },
  },

  prerender: {
    port: 45678,
    recycleEvery: 12, // relaunch Chrome every N routes (OOM in small build containers)
    gotoTimeoutMs: 25000,
    readyTimeoutMs: 20000,
    // A page is "ready" when this selector exists AND #root has > minTextChars.
    // `[data-rh]` is what react-helmet(-async) stamps on its tags, so this
    // proves the page's own meta rendered — not just a spinner.
    readySelector: 'link[rel="canonical"][data-rh]',
    minTextChars: 200,
    rootSelector: "#root",
    userAgent: "Mozilla/5.0 (compatible; SeoPrerender/1.0)",
    /**
     * Runtime modulepreload hints to KEEP (regex over the chunk file name).
     * Vite injects one hint per lazily-loaded chunk while rendering (~40 on a
     * homepage); baked into HTML they all compete with the render-blocking CSS
     * (first paint 3.7s → 2.2s after trimming). Keep: the app shell, the page
     * component chunks, eager vendors, and any component SHARED by two pages
     * (Vite hoists it into its own chunk; a static dep that loses its hint delays
     * the whole page). Set to null to keep all hints.
     */
    renderChain: /\/(App|AppRoutes|SEOManager|Home|About|Contact|vendor-react)\.[\w-]+\.js$/,
    /** Chunks that only load as a render side effect (error dialogs, etc.). */
    dropChunks: /vendor-sweetalert|vendor-select/,
    /** Third-party scripts that inject themselves during render — strip them. */
    analyticsScripts: /clarity\.ms|googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|hotjar/,
    /**
     * Error UI that must never be baked into static HTML. If any matches after
     * rendering, the route is NOT written (an API call failed mid-render and the
     * app opened its error dialog — it would ship to crawlers and visitors).
     */
    errorSelectors: ".swal2-container, .Toastify__toast--error, [role='alertdialog']",
    /**
     * Inline <style> blocks that libraries inject when merely IMPORTED during the
     * render (SweetAlert2 injects ~30 KB the moment its module loads, even if no
     * dialog ever opens). Baked into every page they bloat HTML — Semrush "low
     * text-HTML ratio" — and delay first paint. Matched against the CSS text.
     * The library re-injects them on the client when it actually runs.
     */
    dropInlineStyles: /--swal2|\.swal2-|simple-error-popup|react-toastify__/,
    /** Stylesheets that 404 or are optional in the static page. */
    deadStylesheets: /splash-screen\.css|non-critical\.css/,
    /** Wrap <body> in Cloudflare's <!--email_off--> (only matters behind Cloudflare). */
    cloudflareEmailOff: true,
    /** dist sub-directories that are assets, never pages (skipped by the shell filler). */
    assetDirs: ["assets", "fonts", "Fonts", "media", "images", "sounds"],
  },
};
