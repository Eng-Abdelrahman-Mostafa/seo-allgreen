#!/usr/bin/env node
/**
 * Build gate: "adding a language is a data change" only stays true while no
 * code decides for itself which languages exist. Fails the build when a
 * hard-coded content-language literal appears in a file whose job is to answer
 * a language question (hreflang, sitemap, language switcher, canonical).
 *
 *   node scripts/check-language-literals.mjs [file-or-dir ...]
 *   (run it first in build:static)
 *
 * Scope is deliberately narrow: pass only language-DECIDING files. UI chrome
 * (`isArabic ? "right" : "left"`) is out of scope — flagging it would make the
 * gate so noisy it gets switched off.
 *
 * Escape hatch: a line containing ALLOW_MARKER is skipped, for the genuine case
 * where the language registry is unreachable and a literal is all that's left.
 * Comment lines are ignored (they explain why literals are banned).
 */
import fs from "node:fs";
import path from "node:path";

// CONFIGURE: default files to scan, and the language codes your project uses.
const DEFAULT_SCAN = [
  "src/components/SEOManager.jsx",
  "src/utils/canonicalUrl.js",
  "scripts/generate-seo-routes.mjs",
];
const CODES = ["ar", "en"]; // add every code you'd be tempted to hard-code
const ALLOW_MARKER = "REGISTRY_UNAVAILABLE_FALLBACK";

const c = CODES.join("|");
const BANNED = [
  { re: new RegExp(`\\[\\s*["'](?:${c})["']\\s*,`, "i"), why: "hard-coded language list — read it from the registry" },
  { re: new RegExp(`["'](?:${c})["']\\s*,\\s*["'](?:${c})["']`, "i"), why: "hard-coded language union — read it from the registry" },
  { re: new RegExp(`[=!]==?\\s*["'](?:${c})["']`, "i"), why: "comparison against a language literal — use the registry's default/direction" },
  { re: new RegExp(`["'](?:${c})["']\\s*[=!]==?`, "i"), why: "comparison against a language literal — use the registry's default/direction" },
];
const EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SCAN;
const files = [];
const collect = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) fs.readdirSync(p).forEach((f) => collect(path.join(p, f)));
  else if (EXT.has(path.extname(p))) files.push(p);
};
targets.forEach(collect);

const hits = [];
for (const f of files) {
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (isComment(line) || line.includes(ALLOW_MARKER)) return;
    for (const b of BANNED) if (b.re.test(line)) hits.push(`${f}:${i + 1}  ${b.why}\n    ${line.trim()}`);
  });
}

if (hits.length) {
  console.error(`[language-literals] ${hits.length} hard-coded language literal(s):\n` + hits.join("\n"));
  console.error(`Fix, or mark a deliberate fallback line with ${ALLOW_MARKER}.`);
  process.exit(1);
}
console.log(`[language-literals] OK — ${files.length} file(s) scanned.`);
