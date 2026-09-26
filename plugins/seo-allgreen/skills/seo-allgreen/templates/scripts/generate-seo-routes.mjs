/**
 * Build-time discovery of dynamic detail routes (products, posts, courses, ...).
 *
 *   vite build → node scripts/generate-seo-routes.mjs → node scripts/prerender.mjs
 *
 * Writes scripts/dynamic-routes.json (gitignore it). It does NOT write the
 * sitemap: prerender.mjs appends only the routes that ACTUALLY rendered, via the
 * exported insertUrlsIntoSitemap(). Writing every discovered URL up-front once
 * advertised 48 URLs that served the SPA shell after Chrome crashed mid-run.
 *
 * SOFT-FAIL ONLY: any error logs and exits 0. A flaky API must never break a deploy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Same file the app imports, so a sitemap <loc> can never disagree with a canonical.
import { withTrailingSlash } from "../src/utils/canonicalUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const CONFIG_PATH = path.resolve(ROOT, process.env.SEO_CONFIG || "seo.config.mjs");
const config = (await import(pathToFileURL(CONFIG_PATH).href)).default;

const OUT_ROUTES = path.join(__dirname, "dynamic-routes.json");

/** Plain Node does not load .env (only Vite does) — read the key ourselves. */
function envFromDotenv(key) {
  try {
    const file = path.resolve(ROOT, ".env");
    if (!fs.existsSync(file)) return undefined;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

const apiCfg = config.api || {};
const API = (
  process.env.SEO_API_URL ||
  (apiCfg.envKey && process.env[apiCfg.envKey]) ||
  (apiCfg.envKey && envFromDotenv(apiCfg.envKey)) ||
  apiCfg.fallback ||
  ""
).replace(/\/+$/, "");
const SITE = (process.env.SEO_SITE_ORIGIN || config.siteOrigin).replace(/\/+$/, "");
const MAX_PAGES = Number(process.env.SEO_MAX_PAGES || apiCfg.maxPages || 100);
const TIMEOUT_MS = Number(process.env.SEO_TIMEOUT_MS || apiCfg.timeoutMs || 20000);
const TODAY = new Date().toISOString().slice(0, 10);

let DEFAULT_LANGUAGE = null;

async function getJson(url, { language } = {}) {
  const requested = language === undefined ? DEFAULT_LANGUAGE : language;
  const headers = { Accept: "application/json" };
  if (requested) headers["Accept-Language"] = requested;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export const hasId = (x) => x && x.id != null;
export const hasSlug = (x) => x && typeof x.slug === "string" && x.slug;

/** First array reachable via `paths` whose items match; else BFS the payload. */
export function findItems(obj, predicate, paths = []) {
  for (const p of paths) {
    const v = p.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
    if (Array.isArray(v) && v.some(predicate)) return v;
  }
  const seen = new Set();
  const queue = [obj];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const val of Object.values(cur)) {
      if (Array.isArray(val) && val.some(predicate)) return val;
      if (val && typeof val === "object") queue.push(val);
    }
  }
  return [];
}

export function lastPage(obj) {
  const paths = [
    "data.meta.last_page", "meta.last_page", "data.data.meta.last_page",
    "data.meta.total_pages", "meta.total_pages", "last_page", "totalPages",
  ];
  for (const p of paths) {
    const n = Number(p.split(".").reduce((a, k) => (a == null ? a : a[k]), obj));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

async function collect(source) {
  const predicate = source.key === "slug" ? hasSlug : hasId;
  const routes = [];
  let page = 1;
  let last = 1;
  do {
    const sep = source.endpoint.includes("?") ? "&" : "?";
    const url = source.paged
      ? `${API}/${source.endpoint}${sep}page=${page}`
      : `${API}/${source.endpoint}`;
    const json = await getJson(url);
    for (const item of findItems(json, predicate, source.itemPaths)) {
      const r = source.route(item);
      if (r) routes.push(r);
    }
    last = source.paged ? lastPage(json) : 1;
    page += 1;
  } while (page <= last && page <= MAX_PAGES);
  return routes;
}

export const xmlEscape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ruleFor(route) {
  const s = config.sitemap || {};
  return (s.rules || []).find((r) => route.startsWith(r.prefix)) ||
    s.default || { priority: "0.5", changefreq: "monthly" };
}

/**
 * Pure: insert <url> blocks before </urlset>, skipping <loc>s already present.
 * Returns { xml, added }. No hreflang alternates: only emit those when the
 * server really serves a different file per language (see SKILL.md → hreflang).
 */
export function insertUrlsIntoSitemap(xml, routes, { site = SITE, today = TODAY } = {}) {
  if (!xml.includes("</urlset>")) return { xml, added: 0 };
  const existing = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const blocks = routes
    .map((r) => {
      const loc = xmlEscape(`${site}${withTrailingSlash(r)}`);
      if (existing.has(loc)) return "";
      existing.add(loc);
      const { priority, changefreq } = ruleFor(r);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .filter(Boolean);
  if (!blocks.length) return { xml, added: 0 };
  return {
    xml: xml.replace(/\s*<\/urlset>\s*$/, `\n${blocks.join("\n")}\n</urlset>\n`),
    added: blocks.length,
  };
}

async function main() {
  console.log(`[seo-routes] API: ${API || "(none)"}`);
  if (!API) return console.warn("[seo-routes] No API configured — skipping.");

  if (apiCfg.languagesEndpoint) {
    try {
      const json = await getJson(`${API}/${apiCfg.languagesEndpoint}`, { language: null });
      const block = json?.data?.academy ?? json?.data ?? json ?? {};
      DEFAULT_LANGUAGE = block.default || null;
    } catch (e) {
      console.warn(`[seo-routes] languages unavailable (${e.message})`);
    }
  }

  const all = new Set();
  for (const source of apiCfg.sources || []) {
    try {
      const routes = await collect(source);
      routes.forEach((r) => all.add(r));
      console.log(`  ✓ ${source.name}: ${routes.length} item(s)`);
    } catch (e) {
      console.warn(`  ✗ ${source.name}: ${e.message}`);
    }
  }

  const routes = [...all];
  if (!routes.length) {
    console.warn("[seo-routes] No dynamic routes collected — leaving dynamic-routes.json untouched.");
    return;
  }
  fs.writeFileSync(OUT_ROUTES, `${JSON.stringify(routes, null, 2)}\n`, "utf8");
  console.log(`[seo-routes] Wrote ${routes.length} routes -> ${path.relative(ROOT, OUT_ROUTES)}`);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main()
    .catch((e) => console.error(`[seo-routes] Non-fatal error: ${e?.message || e}`))
    .finally(() => process.exit(0));
}
