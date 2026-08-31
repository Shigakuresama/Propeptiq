import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  findPublicStorefrontProduct,
} from "@/catalog/storefront-public";
import { getPublicStorefrontCatalog } from "@/catalog/storefront-public-server";
import { CatalogItemDetail } from "@/components/commerce/catalog-item-detail";
import { PageTransition } from "@/components/site/page-transition";

type CatalogItemPageProps = {
  params: Promise<{ slug: string }>;
};

const getPublicStorefrontCatalogForRequest = cache(getPublicStorefrontCatalog);

export async function generateMetadata({
  params,
}: CatalogItemPageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getPublicStorefrontCatalogForRequest();
  const product = findPublicStorefrontProduct(catalog, slug);
  return product
    ? {
        title: product.name,
        description: `Browse supplied catalog configurations for ${product.name}.`,
      }
    : { title: "Catalog item unavailable" };
}

export default async function CatalogItemPage({ params }: CatalogItemPageProps) {
  const { slug } = await params;
  const catalog = await getPublicStorefrontCatalogForRequest();
  const product = findPublicStorefrontProduct(catalog, slug);
  if (!product) notFound();

  return (
    <PageTransition>
      <CatalogItemDetail product={product} />
    </PageTransition>
  );
}
