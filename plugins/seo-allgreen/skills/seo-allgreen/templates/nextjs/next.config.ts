import type { NextConfig } from "next";

// SEO-relevant Next.js config (Next.js 16). Merge into your own next.config.ts.
const nextConfig: NextConfig = {
  // Pick ONE URL shape and publish it everywhere. With `true`, /blog 308s to
  // /blog/ and the Metadata API appends the slash to relative canonicals and
  // alternates automatically. With `false` (default) it's the reverse. Either
  // is fine — mixing them (links, sitemap, canonical disagreeing) is not.
  trailingSlash: true,

  images: {
    formats: ["image/avif", "image/webp"],
    // remotePatterns: [{ protocol: "https", hostname: "cdn.example.com" }],
  },

  // Metadata streams to browsers; bots matched here get it blocking in <head>.
  // Next already covers common HTML-only bots. Widen it (or /.*/ to disable
  // streaming metadata entirely) if an SEO tool reports missing titles.
  // htmlLimitedBots: /Googlebot|bingbot|SemrushBot|AhrefsBot|Screaming Frog/i,

  async headers() {
    return [
      {
        // Crawlable (Google renders with them) but never indexed as pages.
        source: "/_next/static/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },

  async redirects() {
    return [
      // Renamed routes: a permanent (308) redirect from the old path, then
      // update links, sitemap and llms.txt in the same change.
      // { source: "/shop/:path*", destination: "/products/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
