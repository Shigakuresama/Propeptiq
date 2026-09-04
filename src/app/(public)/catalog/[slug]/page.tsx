import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { findPublicStorefrontProduct } from "@/catalog/storefront-public";
import { getPublicStorefrontView } from "@/catalog/storefront-public-server";

type LegacyProductPageProps = {
  params: Promise<{ slug: string }>;
};

const getPublicStorefrontViewForRequest = cache(getPublicStorefrontView);

function canonicalProductPath(slug: string): `/catalog/items/${string}` {
  return `/catalog/items/${slug}`;
}

export async function generateMetadata({
  params,
}: LegacyProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = await getPublicStorefrontViewForRequest();
  const product = findPublicStorefrontProduct(view.catalog, slug);

  return product
    ? {
        title: product.name,
        description: `Browse supplied catalog configurations for ${product.name}.`,
        alternates: { canonical: canonicalProductPath(product.slug) },
      }
    : { title: "Catalog item unavailable" };
}

export default async function LegacyProductPage({ params }: LegacyProductPageProps) {
  const { slug } = await params;
  const view = await getPublicStorefrontViewForRequest();
  const product = findPublicStorefrontProduct(view.catalog, slug);

  if (!product) notFound();
  redirect(canonicalProductPath(product.slug));
}
