/**
 * SEOManager — one component owns every SEO tag on a page.
 *
 * Requires react-helmet-async (<HelmetProvider> at the root). Helmet stamps
 * `data-rh` on its tags; prerender.mjs waits for `link[rel=canonical][data-rh]`
 * before snapshotting, so EVERY pre-rendered page must render <SEOManager>.
 *
 * Precedence (highest first) — learned from real duplicate-description bugs:
 *   title        prop → seo.meta_title        → SITE.defaultTitle
 *   description  prop → seo.meta_description  → SITE.defaultDescription
 *   og:title     prop → seo.og_title          → title        (props beat seo.og_*, so
 *   og:desc      prop → seo.og_description    → description   card and meta agree)
 *   og:image     prop → seo.og_image          → SITE.ogImage  (always absolute)
 *   robots       noIndex prop || seo.no_index
 *   JSON-LD      schema prop → seo.structured_data → baseSiteSchema
 *   canonical    canonicalUrl prop → SITE.origin + location.pathname  (NEVER seo.canonical_url)
 *   hreflang     self-referencing pair only (see note)
 *
 * On DETAIL pages pass `seo={item.seo}` and give title/description props ONLY as
 * a fallback when `seo` is missing, leading with the item's own name:
 *
 *   <SEOManager seo={course.seo}
 *     title={course.seo ? undefined : `${course.name} | ${SITE.name}`}
 *     description={course.seo ? undefined : summary(course)}
 *     schema={buildCourseSchema(course)} />
 *
 * Passing a constant (`course.description || t("generic")`) outranks the
 * backend's unique per-item copy and ships the same description on every page.
 */
import { Helmet } from "react-helmet-async";
import { canonicalizeUrl } from "../utils/canonicalUrl";
import { baseSiteSchema } from "../utils/structuredData";

// CONFIGURE ------------------------------------------------------------------
export const SITE = {
  origin: "https://example.com",
  name: "Example",
  defaultTitle: "Example | What the site does in a few words",
  defaultDescription: "150–160 characters describing the site for search results.",
  ogImage: "https://example.com/og-image.jpg", // 1200×630, must exist
  twitter: "@example",
  // language → og:locale (language_TERRITORY per the Open Graph spec)
  ogLocales: { ar: "ar_SA", en: "en_US" },
};
// ----------------------------------------------------------------------------

const SEOManager = ({
  title,
  description,
  canonicalUrl,
  ogImage,
  noIndex = false,
  schema,
  seo, // per-item block from the API, if the backend provides one
  language = "en", // pass the active language from your i18n
}) => {
  const pageTitle = title || seo?.meta_title || SITE.defaultTitle;
  const pageDescription = description || seo?.meta_description || SITE.defaultDescription;
  const shouldNoIndex = noIndex || seo?.no_index === true;

  // Canonical: built from the path we are ACTUALLY served at, so it
  // self-references by construction — in the browser and in pre-rendered HTML
  // (prerender runs on 127.0.0.1 but shares the path). An API's canonical_url
  // describes the BACKEND's URL space (other host, other path, other id space)
  // and once broke canonicals, sitemap, hreflang and internal links at once.
  const here =
    typeof window !== "undefined"
      ? `${SITE.origin}${window.location.pathname}${window.location.search}`
      : "";
  const currentUrl = canonicalizeUrl(canonicalUrl || here);

  const image = ogImage || seo?.og_image || SITE.ogImage;
  const ogTitle = title || seo?.og_title || pageTitle;
  const ogDescription = description || seo?.og_description || pageDescription;
  const ogLocale = SITE.ogLocales[language] || `${language}_${language.toUpperCase()}`;

  const resolvedSchema = schema ?? seo?.structured_data ?? null;
  const schemas = resolvedSchema
    ? Array.isArray(resolvedSchema) ? resolvedSchema : [resolvedSchema]
    : [baseSiteSchema];

  // hreflang: a self-referencing pair ONLY, until the server returns a DIFFERENT
  // file per language (e.g. /en/... pre-rendered separately). Pointing an
  // alternate at `?lang=en` that serves the same HTML is duplicate content and
  // invalidates the cluster; declaring two codes (ar + ar-SA) for one URL is a
  // Search Console "conflicting hreflang" critical.
  const alternates = [
    { hreflang: language, href: currentUrl },
    { hreflang: "x-default", href: currentUrl },
  ];

  return (
    <Helmet>
      <html lang={language} />
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      {currentUrl && <link rel="canonical" href={currentUrl} />}
      <meta
        name="robots"
        content={
          shouldNoIndex
            ? "noindex, nofollow"
            : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
        }
      />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content={ogLocale} />
      {currentUrl && <meta property="og:url" content={currentUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SITE.twitter} />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={ogDescription} />
      <meta name="twitter:image" content={image} />

      {schemas.map((s, i) => (
        <script key={`ld-${i}`} type="application/ld+json">
          {JSON.stringify(s)}
        </script>
      ))}

      {!shouldNoIndex &&
        alternates.map((a) => (
          <link key={a.hreflang} rel="alternate" hrefLang={a.hreflang} href={a.href} />
        ))}
    </Helmet>
  );
};

export default SEOManager;
