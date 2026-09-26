#!/usr/bin/env node
/**
 * Live technical-SEO audit of a site. No dependencies (Node ≥ 18).
 *
 *   node seo-audit.mjs https://example.com [--max 200] [--json]
 *
 * Checks the failure classes Semrush / Search Console reported on real projects:
 *   site level : http→https and www→apex redirect codes (want 301), robots.txt,
 *                sitemap.xml, llms.txt, unknown URL behaviour (must not be a 200
 *                copy of the homepage), slash / no-slash redirect shape
 *   per URL    : status, redirect in sitemap, canonical self-reference and host,
 *   (sitemap)    robots noindex, title / description presence + duplicates,
 *                h1 count, hreflang self-reference, og:image absolute,
 *                JSON-LD parse errors + types, Cloudflare /cdn-cgi/ email links,
 *                empty SPA shell (little text in <body>)
 * Exit code is always 0; read the report.
 */
const args = process.argv.slice(2);
const origin = (args.find((a) => /^https?:\/\//.test(a)) || "").replace(/\/+$/, "");
const MAX = (args.includes("--max") && Number(args[args.indexOf("--max") + 1])) || 200;
const JSON_OUT = args.includes("--json");
if (!origin) {
  console.error("usage: node seo-audit.mjs https://example.com [--max 200] [--json]");
  process.exit(0);
}
const host = new URL(origin).host;
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const issues = [];
const add = (severity, url, msg) => issues.push({ severity, url, msg });

async function get(url, { follow = false } = {}) {
  try {
    const res = await fetch(url, {
      redirect: follow ? "follow" : "manual",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    const text = res.status >= 300 && res.status < 400 ? "" : await res.text();
    return { status: res.status, headers: res.headers, text, location: res.headers.get("location") };
  } catch (e) {
    return { status: 0, error: e.message, headers: new Headers(), text: "" };
  }
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) || [])[1];
// Quote-aware: a `>` inside an attribute value (raw HTML in a description) must
// not end the tag.
const TAG = (name) => new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");
const metaContent = (html, key) => {
  const tag = [...html.matchAll(TAG("meta"))].map((m) => m[0])
    .filter((t) => (attr(t, "name") || attr(t, "property") || "").toLowerCase() === key);
  return tag.map((t) => attr(t, "content") ?? "");
};
const bodyText = (html) =>
  (html.split(/<body[^>]*>/i)[1] || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function siteChecks() {
  const httpUrl = origin.replace(/^https:/, "http:");
  const r1 = await get(httpUrl + "/");
  if (r1.status !== 301 && r1.status !== 308) add("warn", httpUrl, `http→https answers ${r1.status} (want 301)`);

  if (!host.startsWith("www.")) {
    const r2 = await get(`https://www.${host}/`);
    if (r2.status && r2.status !== 301 && r2.status !== 308) add("warn", `www.${host}`, `www→apex answers ${r2.status} (want 301)`);
    if (r2.error) add("info", `www.${host}`, `www not reachable: ${r2.error}`);
  }

  const robots = await get(origin + "/robots.txt");
  if (robots.status !== 200) add("error", "/robots.txt", `status ${robots.status}`);
  else {
    if (!/^sitemap:/im.test(robots.text)) add("warn", "/robots.txt", "no Sitemap: line");
    if (/^Disallow:\s*(\/assets\/?|\/\*\.js\$?|\/\*\.css\$?|\/static\/?)\s*$/im.test(robots.text)) {
      add("warn", "/robots.txt", "blocks JS/CSS/assets — Google can't render; Semrush 'blocked internal resources'. Use X-Robots-Tag: noindex on assets instead");
    }
  }
  const llms = await get(origin + "/llms.txt");
  if (llms.status !== 200) add("warn", "/llms.txt", `status ${llms.status} (Semrush AI-search warning: llms.txt not found)`);
  else {
    const lines = llms.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!/^# \S/.test(lines[0] || "")) add("warn", "/llms.txt", "must start with a single '# Title' line (llmstxt.org) — Semrush formatting issue");
    if (!lines.some((l) => l.startsWith("> "))) add("info", "/llms.txt", "no '> summary' blockquote (llmstxt.org)");
    if (!/\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(llms.text)) add("info", "/llms.txt", "no markdown links to pages");
  }

  const home = await get(origin + "/", { follow: true });
  if (!home.headers.get("strict-transport-security")) add("info", origin, "no HSTS header (Semrush notice: subdomains don't support HSTS)");
  const nope = await get(`${origin}/seo-audit-nonexistent-${Date.now()}/`, { follow: true });
  if (nope.status === 200) {
    const noindex = metaContent(nope.text, "robots").some((c) => /noindex/i.test(c));
    if (!noindex) add("error", "/<unknown>", "unknown URL answers 200 without noindex (soft 404)");
    if (home.text && nope.text.length === home.text.length) add("error", "/<unknown>", "unknown URL serves the HOMEPAGE (fallback is the pre-rendered index.html)");
  }
  return home;
}

async function sitemapUrls() {
  const sm = await get(origin + "/sitemap.xml", { follow: true });
  if (sm.status !== 200) {
    add("error", "/sitemap.xml", `status ${sm.status}`);
    return [];
  }
  let locs = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const children = locs.filter((l) => /\.xml$/i.test(l));
  for (const c of children) {
    const sub = await get(c, { follow: true });
    locs.push(...[...sub.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]));
  }
  locs = locs.filter((l) => !/\.xml$/i.test(l));
  const dupes = locs.filter((l, i) => locs.indexOf(l) !== i);
  if (dupes.length) add("warn", "/sitemap.xml", `duplicate <loc>: ${[...new Set(dupes)].slice(0, 5).join(", ")}`);
  return [...new Set(locs)].slice(0, MAX);
}

async function pageChecks(url, seen) {
  const r = await get(url);
  if (r.status >= 300 && r.status < 400) {
    add("error", url, `in sitemap but redirects ${r.status} → ${r.location}`);
    return;
  }
  if (r.status !== 200) {
    add("error", url, `status ${r.status}${r.error ? " " + r.error : ""}`);
    return;
  }
  const html = r.text;
  const canon = [...html.matchAll(TAG("link"))].map((m) => m[0]).filter((t) => attr(t, "rel") === "canonical").map((t) => attr(t, "href"));
  if (!canon.length) add("error", url, "no canonical");
  else {
    if (canon.length > 1) add("error", url, `${canon.length} canonicals`);
    if (canon[0] !== url) add("error", url, `canonical is ${canon[0]} (not self-referencing)`);
    try { if (new URL(canon[0]).host !== host) add("error", url, `canonical on another host: ${canon[0]}`); } catch { /* */ }
  }
  const robots = metaContent(html, "robots");
  if (robots.length > 1) add("warn", url, `${robots.length} robots metas: ${robots.join(" | ")}`);
  if (robots.some((c) => /noindex/i.test(c))) add("error", url, "noindex page listed in sitemap");

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim();
  const desc = metaContent(html, "description")[0];
  if (!title) add("error", url, "no <title>");
  else {
    if (title.length > 65) add("info", url, `title ${title.length} chars`);
    (seen.titles[title] ||= []).push(url);
  }
  if (!desc) add("error", url, "no meta description");
  else {
    (seen.descs[desc] ||= []).push(url);
    if (/<[a-z]|&lt;[a-z]/i.test(desc)) add("error", url, "meta description contains raw HTML (strip tags from API text)");
    if (desc.length > 170) add("info", url, `description ${desc.length} chars`);
  }

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  if (!h1s.length) add("warn", url, "no <h1> (Semrush warning)");
  if (h1s.length > 1) add("info", url, `${h1s.length} <h1> (Semrush notice)`);
  if (title && h1s[0] === title) add("warn", url, "h1 identical to title (Semrush warning)");
  if (title && [...title].length > 70) add("warn", url, `title ${[...title].length} chars (Semrush: > 70)`);
  const text = bodyText(html);
  const ratio = (Buffer.byteLength(text) / Buffer.byteLength(html)) * 100;
  if (ratio <= 10) add("warn", url, `text-HTML ratio ${ratio.toFixed(1)}% (Semrush: ≤ 10%)`);
  const words = text.split(" ").filter(Boolean).length;
  if (words < 200) add("warn", url, `${words} words (Semrush: < 200)`);
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) add("error", url, "HTML > 2 MB");
  if (!/<meta[^>]+name="viewport"[^>]*width=/i.test(html)) add("error", url, "no viewport meta with width");
  if (/<meta[^>]+http-equiv="refresh"/i.test(html)) add("error", url, "meta refresh");
  if (/(?:src|href)="http:\/\//i.test(html.replace(/<a\b[^>]*>/gi, ""))) add("error", url, "mixed content (http:// resource on https page)");
  if (/_/.test(new URL(url).pathname)) add("warn", url, "underscore in URL");
  if (url.length > 200) add("info", url, "URL > 200 chars");
  const lm = r.headers.get("last-modified");
  if (lm && Date.now() - Date.parse(lm) > 183 * 864e5) add("info", url, `Last-Modified ${lm} (> 6 months: Semrush AI-search 'outdated content')`);
  for (const m of [...html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi)].slice(0, 20)) {
    if (m[1].startsWith("data:")) continue;
    seen.images.add(new URL(m[1], url).href);
  }

  const alts = [...html.matchAll(TAG("link"))].map((m) => m[0]).filter((t) => attr(t, "rel") === "alternate" && attr(t, "hreflang"));
  if (alts.length && !alts.some((t) => attr(t, "href") === url)) add("error", url, "hreflang cluster has no self-reference");

  const ogImg = metaContent(html, "og:image")[0];
  if (!ogImg) add("warn", url, "no og:image");
  else if (!/^https?:\/\//.test(ogImg)) add("error", url, `og:image not absolute: ${ogImg}`);

  const ld = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const types = [];
  for (const m of ld) {
    try {
      const j = JSON.parse(m[1]);
      const nodes = [j, ...(j["@graph"] || [])].flat();
      nodes.forEach((n) => n?.["@type"] && types.push(n["@type"]));
      if (nodes.some((n) => n?.aggregateRating)) add("info", url, "aggregateRating present — must come from real, visible reviews");
    } catch {
      add("error", url, "JSON-LD does not parse");
    }
  }
  if (!ld.length) add("info", url, "no JSON-LD");
  const orgs = types.flat().filter((t) => /Organization$/.test(t)).length;
  if (orgs > 1) add("warn", url, `${orgs} Organization nodes`);

  if (/\/cdn-cgi\/l\/email-protection/.test(html)) add("error", url, "Cloudflare email obfuscation link (404 for crawlers) — wrap in <!--email_off-->");
  const internal = [...html.matchAll(/<a\b[^>]*href="([^"#]+)"/gi)].map((m) => m[1]).filter((h) => h.startsWith("/") || h.startsWith(origin));
  if (internal.length < 3) add("warn", url, `only ${internal.length} internal <a href> — navigation may be JS-only (buttons)`);
  if (bodyText(html).length < 200) add("error", url, "almost no text in HTML — empty SPA shell (not pre-rendered)");

  return internal;
}

(async () => {
  await siteChecks();
  const urls = await sitemapUrls();
  const seen = { titles: {}, descs: {}, images: new Set() };
  const links = new Set();
  for (const u of urls) {
    const found = (await pageChecks(u, seen)) || [];
    found.forEach((h) => links.add(h.startsWith("/") ? origin + h : h));
  }
  for (const [t, us] of Object.entries(seen.titles)) if (us.length > 1) add("warn", us[0], `duplicate title on ${us.length} URLs: "${t.slice(0, 60)}"`);
  for (const [d, us] of Object.entries(seen.descs)) if (us.length > 1) add("warn", us[0], `duplicate description on ${us.length} URLs: "${d.slice(0, 60)}"`);

  // Internal links: redirects and 4xx (sample, capped).
  const slashless = [...links].filter((l) => !/\/$/.test(new URL(l).pathname) && !/\.[a-z0-9]+$/i.test(new URL(l).pathname));
  if (slashless.length) add("info", "(links)", `${slashless.length} internal links without trailing slash, e.g. ${slashless.slice(0, 3).join(", ")}`);
  for (const l of [...links].filter((x) => !urls.includes(x)).slice(0, 60)) {
    const r = await get(l);
    if (r.status >= 400 || r.status === 0) add("error", l, `internal link answers ${r.status}`);
    else if (r.status >= 300) add("warn", l, `internal link redirects ${r.status} → ${r.location}`);
  }

  for (const img of [...seen.images].filter((i) => i.startsWith(origin)).slice(0, 80)) {
    const r = await get(img, { follow: true });
    if (r.status >= 400 || r.status === 0) add("error", img, `broken internal image (${r.status})`);
  }
  // Temporary redirects on internal links (Semrush warning) are caught above as
  // "internal link redirects 30x"; 302/307 specifically:
  for (const i of issues) if (/redirects 30[27]/.test(i.msg)) i.msg += " — temporary redirect (Semrush warning): make it 301";

  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  if (JSON_OUT) return console.log(JSON.stringify({ origin, urls: urls.length, issues }, null, 2));
  console.log(`\nSEO audit — ${origin} — ${urls.length} sitemap URL(s), ${links.size} internal link(s)\n`);
  const count = (s) => issues.filter((i) => i.severity === s).length;
  console.log(`errors ${count("error")}  warnings ${count("warn")}  info ${count("info")}\n`);
  for (const i of issues) console.log(`${i.severity.toUpperCase().padEnd(5)} ${i.url}\n      ${i.msg}`);
})();
