import { SITE, absoluteUrl } from "@/lib/seo";

// llms.txt (llmstxt.org): `# Title`, `> summary`, then link lists. Semrush's
// AI-search checks flag a missing or badly formatted file.
export const dynamic = "force-static";

export function GET() {
  const body = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.defaultDescription}`,
    "",
    "## Main pages",
    "",
    `- [Home](${absoluteUrl("/")}): overview`,
    `- [About](${absoluteUrl("/about")}): who we are`,
    `- [Contact](${absoluteUrl("/contact")}): how to reach us`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
