import type { Metadata } from "next";

// Single source of truth for URL shape and site identity (App Router).
// CONFIGURE ------------------------------------------------------------------
export const SITE = {
  origin: "https://example.com",
  name: "Example",
  defaultTitle: "Example — what the site does in a few words",
  defaultDescription: "150–160 characters describing the site for search results.",
  ogImage: "/og-image.jpg", // 1200×630, must exist in /public
  locale: "en_US", // og:locale is language_TERRITORY
  trailingSlash: true, // must match next.config.ts
};
// ----------------------------------------------------------------------------

/** Path in the site's canonical shape (never used for files like /logo.png). */
export function canonicalPath(path: string): string {
  const clean = "/" + path.replace(/^\/+/, "").split(/[?#]/)[0];
  if (/\.[a-z0-9]+$/i.test(clean) || clean === "/") return clean;
  return SITE.trailingSlash ? clean.replace(/\/?$/, "/") : clean.replace(/\/$/, "");
}

export const absoluteUrl = (path: string) => SITE.origin + canonicalPath(path);

/**
 * Per-page metadata. Always pass the page's OWN path: the canonical is built
 * from it, never from an API field (backends describe their own URL space).
 */
export function pageMetadata(opts: {
  path: string;
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const url = canonicalPath(opts.path);
  const title = opts.title ?? SITE.defaultTitle;
  const description = opts.description ?? SITE.defaultDescription;
  const images = [{ url: opts.image ?? SITE.ogImage, width: 1200, height: 630 }];
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: opts.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { type: "website", url, title, description, siteName: SITE.name, locale: SITE.locale, images },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
}

/** Strip HTML from API text before it reaches a meta tag or JSON-LD. */
export const plainText = (html?: string | null, max = 300) =>
  (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
