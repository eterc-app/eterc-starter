import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublishedPage } from "@/modules/eterc_control/site_builder/page-store";
import { PageRenderer } from "@/modules/eterc_control/site_builder/render-blocks";

// Published pages are read from the local page store on each request. The
// route is intentionally blocking so a freshly saved page is visible without
// a rebuild.
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const page = getPublishedPage(slug);

  if (page === null) {
    return { title: "Page not found | Eterc" };
  }

  return {
    title: `${page.title} | Eterc`,
    description: page.description || undefined,
  };
}

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const page = getPublishedPage(slug);

  if (page === null) {
    notFound();
  }

  return <PageRenderer page={page} />;
}
