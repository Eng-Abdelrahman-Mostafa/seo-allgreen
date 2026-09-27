import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { pageMetadata, plainText } from "@/lib/seo";
import { JsonLd, articleGraph, breadcrumbGraph } from "@/components/JsonLd";

type Post = { slug: string; title: string; excerpt?: string; html: string; image?: string; publishedAt: string; updatedAt?: string };

// Replace with your data source. Only PUBLISHED items.
async function getPost(slug: string): Promise<Post | null> {
  void slug;
  return null;
}
async function getPublishedSlugs(): Promise<string[]> {
  return [];
}

// Pre-render every published item at build time (fast TTFB, no streaming,
// metadata in <head> for every crawler). Same list feeds app/sitemap.ts.
export async function generateStaticParams() {
  return (await getPublishedSlugs()).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { robots: { index: false } };
  return pageMetadata({
    path: `/blog/${slug}`,
    // Item-specific copy, led by the item's own name → no duplicate titles/descriptions.
    title: post.title,
    description: plainText(post.excerpt || post.html, 160), // strip API HTML
    image: post.image,
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  // notFound() BEFORE any <Suspense>/streaming → a real 404 status. Called
  // mid-stream it can only inject noindex on a 200 (a soft 404 in audits).
  if (!post) notFound();

  const path = `/blog/${slug}`;
  const description = plainText(post.excerpt || post.html, 160);

  return (
    <article>
      <JsonLd data={articleGraph({ path, title: post.title, description, image: post.image, published: post.publishedAt, modified: post.updatedAt })} />
      <JsonLd data={breadcrumbGraph([["Home", "/"], ["Blog", "/blog"], [post.title, path]])} />
      {/* Exactly one h1, and it differs from <title> (the template adds the brand). */}
      <h1>{post.title}</h1>
      {post.image && (
        // The LCP image: `preload` (Next 16; `priority` is deprecated),
        // explicit size, `sizes` so the srcset isn't oversized.
        <Image src={post.image} alt={post.title} width={1200} height={630} preload sizes="(max-width: 768px) 100vw, 768px" />
      )}
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}
