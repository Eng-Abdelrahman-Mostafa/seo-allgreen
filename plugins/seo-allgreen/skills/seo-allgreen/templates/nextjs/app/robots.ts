import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// A crawler obeys only its MOST SPECIFIC group, so every group repeats the
// private-area rules. Don't block /_next/ (JS/CSS): Google renders with them.
const PRIVATE = ["/api/", "/admin", "/dashboard", "/login", "/register", "/cart", "/checkout", "/account"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // AI answer/search bots: allowed so the site can be cited in AI answers.
      {
        userAgent: ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-User", "Claude-SearchBot", "Applebot"],
        allow: "/",
        disallow: PRIVATE,
      },
      // AI training scrapers: blocked (a business decision — confirm with the owner).
      {
        userAgent: ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai", "ClaudeBot", "Applebot-Extended", "Bytespider", "meta-externalagent"],
        disallow: "/",
      },
    ],
    sitemap: `${SITE.origin}/sitemap.xml`,
  };
}
