import type { Metadata } from "next";
import { SITE } from "@/lib/seo";
import { JsonLd, organizationGraph } from "@/components/JsonLd";
import { DeferredAnalytics } from "@/components/DeferredAnalytics";

// Root defaults. `metadataBase` turns every relative URL (canonical, og:image)
// into an absolute one. `title.template` keeps page titles unique and branded.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: SITE.defaultTitle, template: `%s | ${SITE.name}` },
  description: SITE.defaultDescription,
  openGraph: { siteName: SITE.name, locale: SITE.locale, images: [SITE.ogImage] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Set lang (and dir="rtl" for Arabic/Hebrew) — Lighthouse a11y + SEO checks.
    <html lang="en">
      <body>
        {/* One Organization + WebSite graph for the whole site. */}
        <JsonLd data={organizationGraph()} />
        <header>{/* <nav> with real <Link href> — never onClick navigation */}</header>
        <main>{children}</main>
        <footer />
        <DeferredAnalytics />
      </body>
    </html>
  );
}
