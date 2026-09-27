import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

// Only indexable, public, 200-status URLs in their canonical (slash) form.
// Never list noindex, redirecting, login-only or "not found" URLs.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["/", "/about", "/contact"].map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));

  // Dynamic items: only PUBLISHED ones. Keep this list in sync with
  // generateStaticParams so the sitemap never lists a page that 404s.
  // const posts = await getPublishedPosts();
  const posts: { slug: string; updatedAt: string }[] = [];
  const dynamicRoutes = posts.map((p) => ({
    url: absoluteUrl(`/blog/${p.slug}`),
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...dynamicRoutes];
}
