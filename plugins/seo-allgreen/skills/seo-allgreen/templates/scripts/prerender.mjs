/**
 * Static pre-rendering for a client-rendered SPA (Vite/CRA/any static build).
 *
 * Crawlers and social scrapers that don't run JS — and, when robots.txt blocks
 * /*.js$, crawlers that CAN'T — only see the empty shell. This loads each public
 * route in headless Chrome after the app renders and writes the HTML to
 * <dist>/<route>/index.html.
 *
 *   node scripts/prerender.mjs          (after `vite build` + generate-seo-routes)
 *
 * Config: seo.config.mjs in the project root (or SEO_CONFIG=path).
 * Chrome: PUPPETEER_EXECUTABLE_PATH | CHROME_PATH | common paths | PATH.
 * Needs: `npm i -D puppeteer-core` (imported lazily — missing ⇒ skip, not fail).
 *
 * Outputs:
 *   <dist>/<route>/index.html   one per route that passed the readiness gate
 *   <dist>/app.html             untouched shell + noindex — the server's SPA fallback
 *   <dist>/<bare dir>/index.html  copies of app.html (bare dirs otherwise 403)
 *   <dist>/sitemap.xml          + each RENDERED dynamic route, flushed one by one
 *
 * Always exits 0. Failures are printed loudly instead.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { insertUrlsIntoSitemap } from "./generate-seo-routes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const CONFIG_PATH = path.resolve(ROOT, process.env.SEO_CONFIG || "seo.config.mjs");
const config = (await import(pathToFileURL(CONFIG_PATH).href)).default;
const P = config.prerender || {};

const DIST = path.resolve(ROOT, process.env.PRERENDER_DIST || config.distDir || "dist");
const SHELL = path.join(DIST, "app.html");
const PROD_ORIGIN = (process.env.PRERENDER_ORIGIN || config.siteOrigin).replace(/\/+$/, "");
const PORT = Number(process.env.PRERENDER_PORT || P.port || 45678);
const RECYCLE_EVERY = Number(process.env.PRERENDER_RECYCLE_EVERY || P.recycleEvery || 12);
const GOTO_TIMEOUT = P.gotoTimeoutMs || 25000;
const READY_TIMEOUT = P.readyTimeoutMs || 20000;
const ROOT_SELECTOR = P.rootSelector || "#root";

const STATIC_ROUTES = config.staticRoutes || ["/"];

function loadDynamicRoutes() {
  const file = path.join(__dirname, "dynamic-routes.json");
  try {
    if (!fs.existsSync(file)) return [];
    const arr = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(arr) ? arr.filter((r) => typeof r === "string" && r.startsWith("/")) : [];
  } catch (e) {
    console.warn(`[prerender] Could not read dynamic-routes.json: ${e.message}`);
    return [];
  }
}
const DYNAMIC_ROUTES = loadDynamicRoutes();
const DYNAMIC_SET = new Set(DYNAMIC_ROUTES);
const ROUTES = [...new Set([...STATIC_ROUTES, ...DYNAMIC_ROUTES])];

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain",
};

function resolveChrome() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
  ];
  const hit = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (hit) return hit;
  // Nix / Nixpacks chromium lives at a hashed store path — resolve from PATH.
  for (const bin of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try {
      const p = execSync(`command -v ${bin} 2>/dev/null || true`, { encoding: "utf8" }).trim();
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined;
}

/** Tiny static server for dist/. Unknown paths get the SHELL, never index.html
 *  (once "/" is rendered, index.html is the homepage and would leak into routes). */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let filePath = path.join(DIST, urlPath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, "index.html");
        }
        if (!fs.existsSync(filePath)) {
          filePath = fs.existsSync(SHELL) ? SHELL : path.join(DIST, "index.html");
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(500);
        res.end("prerender server error");
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

const outFileFor = (route) =>
  route === "/" ? path.join(DIST, "index.html") : path.join(DIST, route.replace(/^\/+/, ""), "index.html");

const rmCompressed = (file) => {
  // Build-time .gz/.br of the ORIGINAL shell would be served instead of the new
  // HTML by gzip_static / `precompressed` handlers.
  for (const ext of [".gz", ".br"]) {
    try { fs.rmSync(file + ext, { force: true }); } catch { /* ignore */ }
  }
};

/**
 * Snapshot the untouched shell to app.html with noindex. MUST run before "/" is
 * rendered. Serving the pre-rendered HOMEPAGE as the fallback made every unknown
 * or private URL answer 200 with the homepage's content and canonical.
 */
function writeAppShell() {
  let html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  if (/data-rh=/.test(html)) {
    console.warn("[prerender] index.html is already pre-rendered — keeping existing app.html. Rebuild first for a fresh shell.");
    return;
  }
  const noindex = '<meta name="robots" content="noindex, follow">';
  html = /<meta\s+name="robots"[^>]*>/i.test(html)
    ? html.replace(/<meta\s+name="robots"[^>]*>/i, noindex)
    : html.replace(/<\/head>/i, `  ${noindex}\n</head>`);
  fs.writeFileSync(SHELL, html, "utf8");
  rmCompressed(SHELL);
  console.log("[prerender] Wrote app.html (noindex SPA fallback shell).");
}

/**
 * Bare route directories (dist/product holding product/1, product/2 …) have no
 * page, so static servers hand file_server a directory → 403, one 4xx per dir in
 * every crawl. Give each a copy of the noindex shell. Only ever ADDS files.
 */
function fillDirectoryShells() {
  if (!fs.existsSync(SHELL)) return;
  const shell = fs.readFileSync(SHELL, "utf8");
  const SKIP = new Set(P.assetDirs || ["assets"]);
  const filled = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      const sub = path.join(dir, entry.name);
      const index = path.join(sub, "index.html");
      if (!fs.existsSync(index)) {
        fs.writeFileSync(index, shell, "utf8");
        filled.push("/" + path.relative(DIST, sub).split(path.sep).join("/") + "/");
      }
      walk(sub);
    }
  };
  walk(DIST);
  if (filled.length) console.log(`[prerender] Filled ${filled.length} bare route dir(s) with the shell: ${filled.join(" ")}`);
}

/**
 * Cloudflare Scrape Shield "Email Address Obfuscation" rewrites mailto: links AND
 * plain-text addresses into /cdn-cgi/l/email-protection links that 404 for
 * crawlers — one broken link per page. Wrap the whole body in the documented
 * opt-out. Idempotent. Harmless when not behind Cloudflare.
 */
function shieldEmails(html) {
  if (!P.cloudflareEmailOff || html.includes("<!--email_off-->")) return html;
  return html
    .replace(/<body[^>]*>/i, (tag) => `${tag}<!--email_off-->`)
    .replace(/<\/body>(?![\s\S]*<\/body>)/i, "<!--/email_off--></body>");
}

/** Runs INSIDE the page (serialised by puppeteer) — args must be plain data. */
function cleanupInPage(opts) {
  const re = (s) => (s ? new RegExp(s.source, s.flags) : null);
  const analytics = re(opts.analytics);
  const renderChain = re(opts.renderChain);
  const dropChunks = re(opts.dropChunks);
  const deadCss = re(opts.deadCss);
  const dropStyles = re(opts.dropStyles);

  // 1. Analytics that injected themselves during render (idle callbacks fire in
  //    headless Chrome too) would load EAGERLY on every real visit.
  if (analytics) {
    for (const s of [...document.querySelectorAll("script[src]")]) {
      if (analytics.test(s.getAttribute("src") || "")) s.remove();
    }
  }

  // 2. Runtime modulepreload hints: keep the render chain, drop the rest.
  for (const link of [...document.querySelectorAll('link[rel="modulepreload"]')]) {
    const href = link.getAttribute("href") || "";
    if (dropChunks && dropChunks.test(href)) link.remove();
    else if (renderChain && link.getAttribute("as") === "script" && !renderChain.test(href)) link.remove();
  }

  // 3. Make the static HTML paint without JS: un-hide root, finish entrance
  //    animations (framer-motion leaves opacity:0 / translate until JS runs).
  const root = document.querySelector(opts.rootSelector);
  if (root) {
    root.style.visibility = "visible";
    root.style.opacity = "1";
    for (const el of root.querySelectorAll("[style]")) {
      const s = el.getAttribute("style") || "";
      if (/opacity:\s*0(?![.\d])/.test(s) || /transform:\s*translate/.test(s)) {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.visibility = "visible";
      }
    }
  }

  // 3b. Library CSS injected at import time (not used by the static page).
  if (dropStyles) {
    for (const st of [...document.querySelectorAll("style")]) {
      if (dropStyles.test(st.textContent || "")) st.remove();
    }
  }

  // 4. Stylesheets: drop dead ones; make Google Fonts non-blocking (print swap).
  const seenFont = new Set();
  for (const link of [...document.querySelectorAll('link[rel="stylesheet"]')]) {
    const href = link.getAttribute("href") || "";
    if (deadCss && deadCss.test(href)) link.remove();
    else if (href.includes("fonts.googleapis.com")) {
      if (seenFont.has(href)) link.remove();
      else {
        seenFont.add(href);
        link.setAttribute("media", "print");
        link.setAttribute("onload", "this.media='all'");
      }
    }
  }

  // 5. Dedupe SEO tags: index.html ships static ones, Helmet adds page ones.
  //    Last (page-specific) wins — two robots metas can contradict each other.
  const isSeoTag = (el) => {
    if (el.tagName === "LINK") return el.getAttribute("rel") === "canonical";
    const name = el.getAttribute("name") || "";
    const prop = el.getAttribute("property") || "";
    return ["description", "keywords", "robots"].includes(name) ||
      name.startsWith("twitter:") || prop.startsWith("og:");
  };
  const keyOf = (el) => el.tagName === "LINK" ? "canonical"
    : (el.getAttribute("name") || el.getAttribute("property") || "").toLowerCase();
  const tags = [...document.querySelectorAll('meta[name], meta[property], link[rel="canonical"]')].filter(isSeoTag);
  const last = new Map();
  tags.forEach((el) => last.set(keyOf(el), el));
  tags.forEach((el) => { if (last.get(keyOf(el)) !== el) el.remove(); });
}

const asPlain = (r) => (r ? { source: r.source, flags: r.flags } : null);
const CLEANUP_OPTS = {
  analytics: asPlain(P.analyticsScripts),
  renderChain: asPlain(P.renderChain),
  dropChunks: asPlain(P.dropChunks),
  deadCss: asPlain(P.deadStylesheets),
  dropStyles: asPlain(P.dropInlineStyles),
  rootSelector: ROOT_SELECTOR,
};

async function prerenderRoute(browser, route) {
  const serverErrors = [];
  let page;
  try {
    // newPage() INSIDE the try: outside it, one sick browser aborted the whole run
    // (and still exited 0 with most routes unrendered).
    page = await browser.newPage();
    page.on("response", (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url().split("?")[0]}`);
    });
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(P.userAgent || "Mozilla/5.0 (compatible; SeoPrerender/1.0)");
    // domcontentloaded, not networkidle0: polling pages never go idle.
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT });

    await page.waitForFunction(
      (sel) => { const r = document.querySelector(sel); return r && r.children.length > 0; },
      { timeout: READY_TIMEOUT, polling: 200 }, ROOT_SELECTOR
    );

    // READINESS GATE. "#root has children" is satisfied by a spinner; blank
    // spinner pages were once written as successes. Ready = the page's own SEO
    // tags rendered AND there is real text.
    const ready = await page
      .waitForFunction(
        (sel, rootSel, min) => {
          const root = document.querySelector(rootSel);
          const text = root ? (root.innerText || "").trim() : "";
          return (!sel || !!document.querySelector(sel)) && text.length > min;
        },
        { timeout: READY_TIMEOUT, polling: 250 },
        P.readySelector || null, ROOT_SELECTOR, P.minTextChars ?? 200
      )
      .then(() => true)
      .catch(() => false);

    await page.waitForNetworkIdle({ idleTime: 700, timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    if (!ready) {
      throw new Error(`not ready after ${READY_TIMEOUT / 1000}s (no SEO tags or no content — usually the API) — NOT written`);
    }

    // Error-UI guard: an API failure during render opened an error dialog/toast.
    if (P.errorSelectors) {
      const errorUi = await page.evaluate(
        (sel) => [...document.querySelectorAll(sel)].map((el) => (el.innerText || "").trim().slice(0, 60)),
        P.errorSelectors
      );
      if (errorUi.length) throw new Error(`error UI visible after render (${errorUi.join(" | ") || "dialog"}) — NOT written`);
    }

    // Redirect guard: auth → /login or gated → 404 must not be baked under this URL.
    const finalPath = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
    const wantPath = route.replace(/\/+$/, "") || "/";
    if (finalPath !== wantPath) throw new Error(`redirected to ${finalPath} (gated/not public)`);

    await page.evaluate(cleanupInPage, CLEANUP_OPTS);
    let html = await page.evaluate(() => "<!DOCTYPE html>\n" + document.documentElement.outerHTML);

    // Canonicals/og:url built from window.location point at the local server.
    html = html
      .split(`http://127.0.0.1:${PORT}`).join(PROD_ORIGIN)
      .split(`http://localhost:${PORT}`).join(PROD_ORIGIN);
    html = shieldEmails(html);

    const out = outFileFor(route);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html, "utf8");
    rmCompressed(out);

    const degraded = [...new Set(serverErrors)];
    const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
    console.log(`  ${degraded.length ? "⚠" : "✓"} ${route.padEnd(34)} -> ${path.relative(DIST, out)} (${kb} KB)` +
      (degraded.length ? `  [API ${degraded.length} × 5xx — content may be missing]` : ""));
    return { written: true, degraded };
  } catch (e) {
    console.warn(`  ✗ ${route.padEnd(34)} skipped: ${e.message}`);
    return { written: false, degraded: [...new Set(serverErrors)] };
  } finally {
    await page?.close().catch(() => {});
  }
}

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`[prerender] ${DIST}/index.html not found — build first.`);
    process.exit(0);
  }
  writeAppShell(); // before any early exit: the server needs app.html regardless

  const executablePath = resolveChrome();
  if (!executablePath) {
    console.error("[prerender] No Chrome/Chromium found (set PUPPETEER_EXECUTABLE_PATH). Skipping.");
    process.exit(0);
  }
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch {
    console.error("[prerender] puppeteer-core not installed — skipping (npm i -D puppeteer-core).");
    process.exit(0);
  }

  console.log(`[prerender] Chrome: ${executablePath}\n[prerender] Origin: ${PROD_ORIGIN}`);
  const server = await startServer();
  const launch = () => puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  let browser = await launch();
  const isAlive = (b) => typeof b.connected === "boolean" ? b.connected
    : typeof b.isConnected === "function" ? b.isConnected() : true;

  const today = new Date().toISOString().slice(0, 10);
  const sitemapFile = path.join(DIST, "sitemap.xml");
  // Flush each rendered dynamic URL immediately: a mid-run OOM kill or build
  // timeout must still leave a sitemap that matches exactly what rendered.
  const flushToSitemap = (route) => {
    try {
      if (!fs.existsSync(sitemapFile)) return;
      const { xml, added } = insertUrlsIntoSitemap(fs.readFileSync(sitemapFile, "utf8"), [route], { site: PROD_ORIGIN, today });
      if (!added) return;
      fs.writeFileSync(sitemapFile, xml, "utf8");
      rmCompressed(sitemapFile);
    } catch { /* never let the sitemap break prerendering */ }
  };

  let ok = 0, dyn = 0, sinceLaunch = 0;
  const failedStatic = [];
  const degradedRoutes = [];
  const recycleBrowser = async () => {
    try { await browser.close(); } catch { /* already dead */ }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { browser = await launch(); sinceLaunch = 0; return true; }
      catch (e) { console.warn(`[prerender] Chrome relaunch ${attempt}/3 failed: ${e.message}`); }
    }
    return false;
  };

  try {
    console.log(`[prerender] Rendering ${ROUTES.length} routes:`);
    for (const route of ROUTES) {
      if (!isAlive(browser) || sinceLaunch >= RECYCLE_EVERY) {
        if (!(await recycleBrowser())) { console.error("[prerender] Could not restart Chrome — abandoning remaining routes."); break; }
      }
      const { written, degraded } = await prerenderRoute(browser, route);
      sinceLaunch += 1;
      if (!written) sinceLaunch = RECYCLE_EVERY; // a failure often means a sick browser
      if (degraded.length) degradedRoutes.push({ route, errors: degraded });
      if (written) {
        ok += 1;
        if (DYNAMIC_SET.has(route)) { dyn += 1; flushToSitemap(route); }
      } else if (!DYNAMIC_SET.has(route)) failedStatic.push(route);
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  fillDirectoryShells(); // after all routes, so real pages always win

  if (dyn) console.log(`[prerender] Sitemap: ${dyn} dynamic URL(s) added.`);
  if (DYNAMIC_ROUTES.length - dyn > 0) console.log(`[prerender] Sitemap: ${DYNAMIC_ROUTES.length - dyn} dynamic URL(s) not rendered — omitted.`);
  console.log(`[prerender] Done: ${ok}/${ROUTES.length} routes pre-rendered.`);

  if (degradedRoutes.length) {
    console.warn(`\n[prerender] ⚠️  ${degradedRoutes.length} route(s) rendered while the API returned 5xx:\n` +
      degradedRoutes.map((d) => `      ${d.route}  (${d.errors.slice(0, 2).join(", ")})`).join("\n") +
      "\n    Their API-driven content is MISSING. Fix the backend and rebuild before deploying.\n");
  }
  if (failedStatic.length) {
    console.warn(`\n[prerender] ⚠️  ${failedStatic.length} PUBLIC route(s) did NOT pre-render:\n` +
      failedStatic.map((r) => `      ${r}`).join("\n") +
      "\n    The hand-written sitemap lists them but they now serve the noindex shell.\n    Do NOT ship this build as-is.\n");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[prerender] Fatal:", e, "\n[prerender] ⚠️  Run ABORTED — output is INCOMPLETE. Do not deploy.");
  process.exit(0);
});
