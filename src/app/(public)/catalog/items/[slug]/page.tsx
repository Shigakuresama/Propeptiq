import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicBrowseCatalog } from "@/catalog/browse-catalog-server";
import { CatalogItemDetail } from "@/components/commerce/catalog-item-detail";
import { PageTransition } from "@/components/site/page-transition";

type CatalogItemPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: CatalogItemPageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getPublicBrowseCatalog();
  const product = catalog.products.find((entry) => entry.slug === slug);
  return product
    ? {
        title: product.name,
        description: `Browse supplied catalog configurations for ${product.name}.`,
      }
    : { title: "Catalog item unavailable" };
}

export default async function CatalogItemPage({ params }: CatalogItemPageProps) {
  const { slug } = await params;
  const catalog = await getPublicBrowseCatalog();
  const product = catalog.products.find((entry) => entry.slug === slug);
  if (!product) notFound();

  return (
    <PageTransition>
      <CatalogItemDetail product={product} />
    </PageTransition>
  );
}
