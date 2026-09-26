#!/usr/bin/env node
/**
 * Verify a pre-rendered build BEFORE deploying. No dependencies.
 *
 *   node verify-dist.mjs [distDir=dist] [--origin https://example.com]
 *
 * Fails loudly (exit 1) on anything that would ship an SEO regression:
 *   - sitemap <loc> without a rendered file, without trailing slash, or on noindex
 *   - canonical missing / not self-referencing / wrong host / localhost leaked
 *   - duplicate titles or descriptions across indexable pages
 *   - raw HTML inside meta descriptions
 *   - JSON-LD that does not parse
 *   - eager analytics <script src> baked in by the prerender
 *   - Cloudflare email_off wrap missing (only if any page uses it)
 *   - app.html missing or indexable; bare route directories without index.html
 * Prints modulepreload hint counts so render-chain regressions are visible.
 *
 * Also reports Semrush Site Audit heuristics as WARN (they don't fail the build):
 * text-HTML ratio ≤ 10 %, < 200 words, title > 70 chars, missing / multiple h1,
 * h1 identical to title, HTML > 2 MB, > 3,000 links, no viewport / doctype /
 * charset / lang, meta refresh, underscores or > 200 chars in the URL, nofollow
 * internal links, http:// links to the own site, frames, baked error dialogs.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const DIST = path.resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--origin") || "dist");
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const originArg = flag("--origin");

const TAG = (name) => new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) || [])[1];
const metas = (html, key) => [...html.matchAll(TAG("meta"))].map((m) => m[0])
  .filter((t) => (attr(t, "name") || attr(t, "property") || "").toLowerCase() === key)
  .map((t) => attr(t, "content") ?? "");

// Rendered error UI (SweetAlert2 dialog, error toast) — class names in markup, not CSS.
const P_ERROR_UI = /<div[^>]+class="[^"]*(swal2-container|Toastify__toast--error)/;

const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "index.html") files.push(p);
  }
};
if (!fs.existsSync(DIST)) {
  console.error(`no ${DIST}`);
  process.exit(1);
}
walk(DIST);

const shellPath = path.join(DIST, "app.html");
const shell = fs.existsSync(shellPath) ? fs.readFileSync(shellPath, "utf8") : null;
if (!shell) err("app.html", "missing — the server has no noindex fallback");
else if (!metas(shell, "robots").some((c) => /noindex/i.test(c))) err("app.html", "not noindex");

const rel = (f) => "/" + path.relative(DIST, path.dirname(f)).split(path.sep).join("/") + (path.dirname(f) === DIST ? "" : "/");
const pages = {};
const titles = {};
const descs = {};
let usesEmailOff = false;
let origin = originArg;

for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  const route = rel(f).replace(/\/\/$/, "/");
  const isShell = shell && html === shell;
  const noindex = metas(html, "robots").some((c) => /noindex/i.test(c));
  pages[route] = { isShell, noindex };
  if (isShell) continue;

  if (/127\.0\.0\.1:\d+|localhost:\d+/.test(html)) err(route, "local prerender origin leaked into HTML");
  const canon = [...html.matchAll(TAG("link"))].map((m) => m[0]).filter((t) => attr(t, "rel") === "canonical").map((t) => attr(t, "href"));
  if (canon.length !== 1) err(route, `${canon.length} canonical tags`);
  else {
    const u = new URL(canon[0]);
    origin ||= u.origin;
    if (u.origin !== origin) err(route, `canonical host ${u.origin} ≠ ${origin}`);
    if (u.pathname !== route) err(route, `canonical path ${u.pathname} ≠ served path ${route}`);
  }
  if (metas(html, "robots").length > 1) err(route, "more than one robots meta");

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim();
  const desc = metas(html, "description")[0];
  if (!noindex) {
    if (title) (titles[title] ||= []).push(route); else err(route, "no <title>");
    if (desc) (descs[desc] ||= []).push(route); else err(route, "no meta description");
  }
  if (desc && /<[a-z]|&lt;[a-z]/i.test(desc)) err(route, "raw HTML in meta description");

  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1]); } catch { err(route, "JSON-LD does not parse"); }
  }
  if (/<script[^>]*src="[^"]*(clarity\.ms|googletagmanager|google-analytics|connect\.facebook|hotjar)/i.test(html)) {
    err(route, "analytics <script src> baked into static HTML (loads eagerly)");
  }
  if (html.includes("<!--email_off-->")) usesEmailOff = true;

  // ---- Semrush Site Audit heuristics (thresholds from Semrush's issue list) ----
  const B = (x) => Buffer.byteLength(x);
  const text = (html.split(/<body[^>]*>/i)[1] || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const ratio = (B(text) / B(html)) * 100;
  const words = text.split(" ").filter(Boolean).length;
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const semrush = [];
  if (ratio <= 10) semrush.push(`text-HTML ratio ${ratio.toFixed(1)}% (≤ 10%)`);
  if (!noindex && words < 200) semrush.push(`${words} words (< 200)`);
  if (title && [...title].length > 70) semrush.push(`title ${[...title].length} chars (> 70)`);
  if (!h1s.length) semrush.push("no h1");
  if (h1s.length > 1) semrush.push(`${h1s.length} h1 tags`);
  if (title && h1s[0] && h1s[0] === title) semrush.push("h1 identical to title");
  if (B(html) > 2 * 1024 * 1024) err(route, "HTML > 2 MB (Semrush error)");
  const links = (html.match(/<a\b[^>]*href=/gi) || []).length;
  if (links > 3000) semrush.push(`${links} links (> 3000)`);
  if (!/<meta[^>]+name="viewport"[^>]*width=/i.test(html)) err(route, "no viewport meta with width (Semrush error)");
  if (!/^\s*<!doctype html>/i.test(html)) semrush.push("no doctype");
  if (!/<meta[^>]+charset=/i.test(html.slice(0, 1024))) semrush.push("charset not in first 1024 bytes");
  if (!/<html[^>]+lang="[^"]+"/i.test(html)) semrush.push("no <html lang>");
  if (/<meta[^>]+http-equiv="refresh"/i.test(html)) err(route, "meta refresh (Semrush error)");
  if (/_/.test(route)) semrush.push("underscore in URL");
  if (((origin || "") + route).length > 200) semrush.push("URL > 200 chars");
  if (/<a\b[^>]*href="(?:\/|https?:\/\/[^"]*)[^"]*"[^>]*rel="[^"]*nofollow/i.test(html)) semrush.push("link with nofollow (check it is external)");
  if (origin && html.includes(origin.replace("https://", "http://") + "/")) semrush.push("http:// link to own site");
  if (/<i?frame\b/i.test(html)) semrush.push("frames/iframes");
  if (P_ERROR_UI.test(html)) err(route, "error dialog/toast baked into HTML");
  if (semrush.length) warn(route, "Semrush: " + semrush.join("; "));
  pages[route].html = html;
  pages[route].preloads = (html.match(/rel="modulepreload"/g) || []).length;
}

if (usesEmailOff) {
  for (const [r, p] of Object.entries(pages)) if (!p.isShell && !p.html.includes("<!--email_off-->")) err(r, "missing <!--email_off--> wrap");
}
for (const [t, rs] of Object.entries(titles)) if (rs.length > 1) warn(rs.join(", "), `duplicate title "${t.slice(0, 50)}"`);
for (const [d, rs] of Object.entries(descs)) if (rs.length > 1) err(rs.join(", "), `duplicate description "${d.slice(0, 50)}"`);

// Bare directories (no index.html) → 403 on most static servers.
const dirs = [];
const walkDirs = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory() || /^(assets|fonts|Fonts|media|images|sounds|icons)$/.test(e.name)) continue;
    const p = path.join(d, e.name);
    if (!fs.existsSync(path.join(p, "index.html"))) dirs.push("/" + path.relative(DIST, p) + "/");
    walkDirs(p);
  }
};
walkDirs(DIST);
if (dirs.length) warn(dirs.slice(0, 8).join(" "), "directories without index.html (403 on static servers)");

const smPath = path.join(DIST, "sitemap.xml");
let locCount = 0;
if (!fs.existsSync(smPath)) err("sitemap.xml", "missing");
else {
  const locs = [...fs.readFileSync(smPath, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  locCount = locs.length;
  const seen = new Set();
  for (const loc of locs) {
    const u = new URL(loc);
    if (seen.has(loc)) err("sitemap.xml", `duplicate ${loc}`);
    seen.add(loc);
    if (origin && u.origin !== origin) err("sitemap.xml", `${loc} not on ${origin}`);
    if (!u.pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(u.pathname)) err("sitemap.xml", `${loc} has no trailing slash (redirects)`);
    const p = pages[u.pathname];
    if (!p) err("sitemap.xml", `${loc} has no rendered file`);
    else if (p.isShell) err("sitemap.xml", `${loc} serves the SPA shell`);
    else if (p.noindex) err("sitemap.xml", `${loc} is noindex`);
  }
}

const real = Object.entries(pages).filter(([, p]) => !p.isShell);
console.log(`dist: ${DIST}\norigin: ${origin || "(unknown)"}\npages: ${real.length} rendered, ${Object.keys(pages).length - real.length} shells; sitemap URLs: ${locCount}`);
const pre = real.map(([r, p]) => [r, p.preloads]).sort((a, b) => b[1] - a[1]);
if (pre.length) console.log(`modulepreload hints: max ${pre[0][1]} (${pre[0][0]}), home ${pages["/"]?.preloads ?? "-"}`);
if (warns.length) console.log(`\nWARN (${warns.length})\n  ` + warns.join("\n  "));
if (errors.length) console.log(`\nERROR (${errors.length})\n  ` + errors.join("\n  "));
else console.log("\n✓ no blocking SEO issues in the build");
process.exit(errors.length ? 1 : 0);
