#!/usr/bin/env node
/**
 * PageSpeed Insights (same engine as https://pagespeed.web.dev/) from the CLI.
 * No dependencies, Node ≥ 18.
 *
 *   node pagespeed.mjs https://example.com/ [--desktop] [--both] [--runs 3] [--json]
 *   PSI_API_KEY=… node pagespeed.mjs …     # optional; without a key Google rate-limits
 *   node pagespeed.mjs https://… --local   # same Lighthouse engine on this machine
 *                                          # (npx lighthouse + local Chrome; no quota;
 *                                          # also works for http://localhost builds)
 *
 * Prints, per strategy:
 *   - the 4 category scores (Performance, Accessibility, Best Practices, SEO)
 *   - each lab metric vs the value needed for a ~100 score (see pagespeed-100.md)
 *   - field data (CrUX: LCP / INP / CLS at p75) when Google has it
 *   - every audit that is NOT passing, grouped by category, weighted audits
 *     first, with savings — i.e. exactly what stands between you and 100
 *
 * Test the CANONICAL URL (with its trailing slash). Testing a URL that redirects
 * adds the redirect to FCP/LCP and fails "Avoid multiple page redirects".
 * Lab scores vary ±5 run to run: use --runs 3 and read the median.
 */
const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error("usage: node pagespeed.mjs https://example.com/ [--desktop|--both] [--runs N] [--json]");
  process.exit(0);
}
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const RUNS = Math.max(1, Number(flag("--runs")) || 1);
const strategies = args.includes("--both") ? ["mobile", "desktop"] : [args.includes("--desktop") ? "desktop" : "mobile"];
const JSON_OUT = args.includes("--json");
const CATS = ["performance", "accessibility", "best-practices", "seo"];

// Metric values for a per-metric score of ~0.99 (Lighthouse 10+ log-normal curves).
const TARGET = {
  mobile: { "first-contentful-paint": 1190, "largest-contentful-paint": 1700, "speed-index": 2190, "total-blocking-time": 80, "cumulative-layout-shift": 0.047 },
  desktop: { "first-contentful-paint": 600, "largest-contentful-paint": 680, "speed-index": 830, "total-blocking-time": 75, "cumulative-layout-shift": 0.047 },
};
// Reported metrics with no score weight and no fix of their own.
const INFORMATIVE = new Set(["interactive", "max-potential-fid", "first-meaningful-paint"]);
// Estimated ms saved: explicit overall savings, else the largest per-metric saving
// (Lighthouse 13 insights report e.g. { FCP: 1020, LCP: 1020 }). CLS is unitless.
const savedMs = (a) =>
  a.details?.overallSavingsMs ||
  Math.max(0, ...Object.entries(a.metricSavings || {}).filter(([k]) => k !== "CLS").map(([, v]) => v || 0));
const METRIC_WEIGHT = { "first-contentful-paint": 10, "speed-index": 10, "largest-contentful-paint": 25, "total-blocking-time": 30, "cumulative-layout-shift": 25 };

const LOCAL = args.includes("--local");

async function runLocal(strategy) {
  // Lighthouse's defaults ARE the PSI mobile lab setup (Moto G Power emulation,
  // simulated slow 4G, 4× CPU); --preset=desktop is PSI's desktop run.
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const out = path.join(os.tmpdir(), `lh-${process.pid}-${Date.now()}.json`);
  const cli = ["-y", "lighthouse@latest", url, "--output=json", `--output-path=${out}`, "--quiet",
    "--chrome-flags=--headless=new --no-sandbox", ...CATS.map((c) => `--only-categories=${c}`)];
  if (strategy === "desktop") cli.push("--preset=desktop");
  execFileSync("npx", cli, { stdio: ["ignore", "ignore", "inherit"], timeout: 300000 });
  const lhr = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return { lighthouseResult: lhr };
}

async function run(strategy) {
  if (LOCAL) return runLocal(strategy);
  const q = new URLSearchParams({ url, strategy });
  CATS.forEach((c) => q.append("category", c));
  if (process.env.PSI_API_KEY) q.set("key", process.env.PSI_API_KEY);
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, {
    signal: AbortSignal.timeout(120000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function summarise(results, strategy) {
  // Pick the run with the median performance score; report its audits.
  const perf = results.map((r) => r.lighthouseResult.categories.performance.score);
  const pick = results[perf.indexOf(median(perf))];
  const lh = pick.lighthouseResult;
  const scores = Object.fromEntries(CATS.map((c) => [c, Math.round((lh.categories[c]?.score ?? 0) * 100)]));
  const allRuns = CATS.map((c) => [c, results.map((r) => Math.round((r.lighthouseResult.categories[c]?.score ?? 0) * 100))]);

  const metrics = Object.keys(TARGET[strategy]).map((id) => {
    const a = lh.audits[id];
    return { id, value: a?.numericValue, display: a?.displayValue, score: a?.score, target: TARGET[strategy][id], weight: METRIC_WEIGHT[id] };
  });

  const field = pick.loadingExperience?.metrics
    ? Object.fromEntries(Object.entries(pick.loadingExperience.metrics).map(([k, v]) => [k, { p75: v.percentile, category: v.category }]))
    : null;

  const failing = {};
  for (const c of CATS) {
    const refs = lh.categories[c]?.auditRefs || [];
    failing[c] = refs
      .map((ref) => ({ ref, a: lh.audits[ref.id] }))
      .filter(({ ref, a }) => a && ref.group !== "metrics" && !INFORMATIVE.has(ref.id) && a.score !== null && a.score < 1 &&
        !["notApplicable", "manual", "informative"].includes(a.scoreDisplayMode))
      .map(({ ref, a }) => ({
        id: ref.id,
        weight: ref.weight,
        score: a.score,
        title: a.title,
        display: a.displayValue || "",
        savingsMs: savedMs(a),
        savingsBytes: a.details?.overallSavingsBytes || 0,
        items: (a.details?.items || []).slice(0, 3).map((i) => i.url || i.node?.snippet || i.source?.url || i.label || "").filter(Boolean),
      }))
      .sort((x, y) => y.weight - x.weight || y.savingsMs - x.savingsMs);
    // Performance "insights"/diagnostics carry weight 0 but still hurt metrics.
    if (c === "performance") {
      const insights = Object.values(lh.audits).filter((a) =>
        !INFORMATIVE.has(a.id) && a.score !== null && a.score < 1 && (a.details?.overallSavingsMs > 0 || a.metricSavings?.LCP > 0 || a.metricSavings?.FCP > 0 || a.metricSavings?.TBT > 0 || a.metricSavings?.CLS > 0) &&
        !failing[c].some((f) => f.id === a.id));
      failing[c].push(...insights.map((a) => ({
        id: a.id, weight: 0, score: a.score, title: a.title, display: a.displayValue || "",
        savingsMs: savedMs(a),
        savingsBytes: a.details?.overallSavingsBytes || 0,
        items: (a.details?.items || []).slice(0, 3).map((i) => i.url || i.node?.snippet || "").filter(Boolean),
      })).sort((x, y) => y.savingsMs - x.savingsMs));
    }
  }
  return { strategy, lighthouse: lh.lighthouseVersion, scores, allRuns, metrics, field, failing };
}

function print(s) {
  const fmt = (m) => (m.id === "cumulative-layout-shift" ? m.value?.toFixed(3) : `${Math.round(m.value)} ms`);
  console.log(`\n══ ${s.strategy.toUpperCase()} — Lighthouse ${s.lighthouse} ══`);
  console.log(Object.entries(s.scores).map(([c, v]) => `${c} ${v === 100 ? "✓100" : v}`).join("   "));
  if (s.allRuns[0][1].length > 1) console.log("runs: " + s.allRuns.map(([c, v]) => `${c} [${v.join(",")}]`).join("  "));
  console.log("\nLab metrics (value → target for ~100, weight):");
  for (const m of s.metrics) {
    const ok = m.value <= m.target;
    console.log(`  ${ok ? "✓" : "✗"} ${m.id.padEnd(26)} ${String(fmt(m)).padStart(9)} → ≤ ${m.id === "cumulative-layout-shift" ? m.target : m.target + " ms"}  (${m.weight}%)`);
  }
  if (s.field) {
    console.log("\nField data (real users, p75):");
    for (const [k, v] of Object.entries(s.field)) console.log(`  ${k.padEnd(36)} ${v.p75}  ${v.category}`);
  } else console.log("\nField data: none (not enough real-user traffic in CrUX)");
  for (const [c, list] of Object.entries(s.failing)) {
    if (!list.length) continue;
    console.log(`\n${c} — ${list.length} not passing:`);
    for (const f of list) {
      const save = [f.savingsMs ? `~${Math.round(f.savingsMs)} ms` : "", f.savingsBytes ? `~${Math.round(f.savingsBytes / 1024)} KiB` : ""].filter(Boolean).join(", ");
      console.log(`  ${f.weight ? `[w${f.weight}]` : "[ins]"} ${f.title}${f.display ? ` — ${f.display}` : ""}${save ? `  (${save})` : ""}  {${f.id}}`);
      for (const it of f.items) console.log(`        · ${String(it).replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }
}

(async () => {
  const out = [];
  for (const strategy of strategies) {
    const results = [];
    for (let i = 0; i < RUNS; i += 1) {
      try {
        results.push(await run(strategy));
      } catch (e) {
        console.error(`[${strategy} run ${i + 1}] ${e.message}${/quota|rate/i.test(e.message) ? " — set PSI_API_KEY (free key from Google Cloud console) or use --local" : ""}`);
      }
    }
    if (results.length) out.push(summarise(results, strategy));
  }
  if (JSON_OUT) return console.log(JSON.stringify(out, null, 2));
  console.log(`PageSpeed Insights — ${url}`);
  out.forEach(print);
})();
