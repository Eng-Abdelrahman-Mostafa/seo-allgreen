/**
 * Schema.org JSON-LD builders. Each export is ONE self-contained @graph, so every
 * @id reference resolves on the page (valid in the Rich Results Test alone).
 *
 * Rules that came from real audit failures:
 * - ONE Organization node site-wide, one @id (`#organization`). Don't also
 *   declare one in index.html with a different name.
 * - No hardcoded aggregateRating / reviews (self-serving review policy).
 * - No Course/Product nodes on pages that don't show one. Listing pages use a
 *   plain ItemList. Placeholder Course nodes on the shared graph shipped on every
 *   page and produced 25 "invalid item" errors.
 * - Course: provider + hasCourseInstance (instructor lives on the instance) +
 *   offers + description. No price when prices vary by country — a wrong price is
 *   a penalty, a missing one only a warning.
 * - Every url/@id goes through withTrailingSlash — never a URL that redirects.
 * - Actions for noindex pages (register/login) go on the Organization as
 *   potentialAction — schema on a noindex page is never read.
 * - Builders are null-safe: a detail page renders before its data arrives.
 */
import { withTrailingSlash } from "./canonicalUrl";

// CONFIGURE ------------------------------------------------------------------
const SITE = "https://example.com";
const NAME = "Example";
const ALT_NAME = "";            // e.g. native-language name
const LOGO = `${SITE}/logo.png`; // raster, ≥112×112, crawlable (not blocked by robots)
const IMAGE = `${SITE}/og-image.jpg`;
const SLOGAN = "";
const SAME_AS = [
  // "https://www.facebook.com/example", "https://www.youtube.com/@example",
];
const ORG_TYPE = "Organization"; // or EducationalOrganization, LocalBusiness, ...
const CONTACT = null; // { telephone: "+1…", email: "hi@example.com", contactType: "customer support" }
// ----------------------------------------------------------------------------

export const pageUrl = (path = "/") =>
  `${SITE}${withTrailingSlash(`/${String(path).replace(/^\/+/, "")}`)}`;

const ORG_REF = { "@id": `${SITE}/#organization` };
const SITE_REF = { "@id": `${SITE}/#website` };

export const stripHtml = (html, max = 5000) =>
  html
    ? String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

const organization = {
  "@type": ORG_TYPE,
  "@id": ORG_REF["@id"],
  name: NAME,
  ...(ALT_NAME && { alternateName: ALT_NAME }),
  url: pageUrl("/"),
  logo: { "@type": "ImageObject", url: LOGO },
  image: IMAGE,
  ...(SLOGAN && { slogan: SLOGAN }),
  ...(SAME_AS.length && { sameAs: SAME_AS }),
  ...(CONTACT && { contactPoint: { "@type": "ContactPoint", ...CONTACT } }),
  potentialAction: {
    "@type": "RegisterAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: pageUrl("/register"),
      actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"],
    },
  },
};

const website = {
  "@type": "WebSite",
  "@id": SITE_REF["@id"],
  url: pageUrl("/"),
  name: NAME,
  publisher: ORG_REF,
};

/** Wrap page nodes with the site-wide Organization + WebSite. */
export const graph = (...nodes) => ({
  "@context": "https://schema.org",
  "@graph": [organization, website, ...nodes.filter(Boolean)],
});

export const breadcrumb = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: pageUrl(path),
  })),
});

export const baseSiteSchema = graph();

export const webPage = (type, path, name, description, crumbs) =>
  graph(
    { "@type": type, "@id": `${pageUrl(path)}#webpage`, url: pageUrl(path), name, description, isPartOf: SITE_REF, about: ORG_REF },
    crumbs && breadcrumb(crumbs)
  );
// e.g. webPage("AboutPage", "/about", "About us", "...", [["Home", "/"], ["About", "/about"]])
//      webPage("ContactPage", ...), webPage("CollectionPage", ...)

export const itemList = (path, items) =>
  graph({
    "@type": "ItemList",
    url: pageUrl(path),
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, url: pageUrl(it.path),
    })),
  });

export const buildCourseSchema = (course, { path, description, instructor, currency } = {}) => {
  if (!course) return baseSiteSchema;
  const url = pageUrl(path || `/course/${course.id}`);
  return graph(
    {
      "@type": "Course",
      "@id": `${url}#course`,
      name: course.name,
      description: description || stripHtml(course.description, 500) || course.name,
      url,
      ...(course.image && { image: course.image }),
      provider: ORG_REF,
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "online",
        ...(instructor && { instructor: { "@type": "Person", name: instructor } }),
      },
      offers: {
        "@type": "Offer",
        category: course.price == null ? "Subscription" : "Paid",
        ...(course.price != null && { price: String(course.price), priceCurrency: currency }),
        availability: "https://schema.org/InStock",
        url,
      },
    },
    breadcrumb([["Home", "/"], ["Courses", "/courses"], [course.name, path || `/course/${course.id}`]])
  );
};

export const buildProductSchema = (p, { path, currency } = {}) => {
  if (!p) return baseSiteSchema;
  const url = pageUrl(path || `/product/${p.id}`);
  return graph({
    "@type": "Product",
    name: p.name,
    description: stripHtml(p.description, 500) || p.name,
    ...(p.image && { image: p.image }),
    url,
    brand: ORG_REF,
    ...(p.price != null && {
      offers: { "@type": "Offer", price: String(p.price), priceCurrency: currency, availability: "https://schema.org/InStock", url },
    }),
    // aggregateRating ONLY from real, visible reviews:
    ...(p.rating && p.reviews_count && {
      aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews_count },
    }),
  });
};

export const buildArticleSchema = (a, { path } = {}) => {
  if (!a) return baseSiteSchema;
  const url = pageUrl(path || `/blog/${a.slug}`);
  return graph({
    "@type": "BlogPosting",
    headline: a.title,
    description: stripHtml(a.excerpt || a.content, 300),
    ...(a.image && { image: a.image }),
    datePublished: a.published_at || a.created_at,
    dateModified: a.updated_at || a.published_at,
    author: a.author ? { "@type": "Person", name: a.author } : ORG_REF,
    publisher: ORG_REF,
    mainEntityOfPage: url,
  });
};

export const buildPersonSchema = (person, { path } = {}) => {
  if (!person) return baseSiteSchema;
  return graph({
    "@type": "Person",
    name: person.name,
    url: pageUrl(path || `/person/${person.id}`),
    ...(person.image && { image: person.image }),
    ...(person.job_title && { jobTitle: person.job_title }),
    worksFor: ORG_REF,
  });
};

/** Emits FAQPage only when there are real Q&As; otherwise the base graph. */
export const buildFaqSchema = (faqs) => {
  const items = (faqs || []).filter((f) => f?.question && f?.answer);
  if (!items.length) return baseSiteSchema;
  return graph({
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: stripHtml(f.question),
      acceptedAnswer: { "@type": "Answer", text: stripHtml(f.answer) },
    })),
  });
};
