import { SITE, absoluteUrl } from "@/lib/seo";

// Next.js has no Metadata field for JSON-LD: render a native <script> in a
// Server Component. Escape "<" so API text can't close the tag (XSS).
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const ORG_ID = `${SITE.origin}/#organization`;

/** One Organization + WebSite node for the whole site (render once, in the root layout). */
export function organizationGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: SITE.name,
        url: absoluteUrl("/"),
        logo: `${SITE.origin}/logo.png`, // raster, ≥112px, not blocked by robots
        // sameAs: ["https://www.linkedin.com/company/example"],
      },
      { "@type": "WebSite", "@id": `${SITE.origin}/#website`, url: absoluteUrl("/"), name: SITE.name, publisher: { "@id": ORG_ID } },
    ],
  };
}

/** Page-level nodes reference the org by @id instead of repeating it. */
export function articleGraph(a: { path: string; title: string; description: string; image?: string; published: string; modified?: string; author?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.description,
    ...(a.image && { image: a.image }),
    datePublished: a.published,
    dateModified: a.modified ?? a.published,
    author: a.author ? { "@type": "Person", name: a.author } : { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: absoluteUrl(a.path),
  };
}

export function breadcrumbGraph(items: [name: string, path: string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: absoluteUrl(path) })),
  };
}
