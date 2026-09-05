import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { findPublicStorefrontProduct, resolvePublicStorefrontRelatedProducts } from "@/catalog/storefront-public";
import { getPublicStorefrontView } from "@/catalog/storefront-public-server";
import { CatalogItemDetail } from "@/components/commerce/catalog-item-detail";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicConcentrationCalculatorConfiguration } from "@/config/concentration-calculator-server";
import { publicCompoundResearch } from "@/content/compound-research";

type CatalogItemPageProps = {
  params: Promise<{ slug: string }>;
};

const getPublicStorefrontViewForRequest = cache(getPublicStorefrontView);

export async function generateMetadata({
  params,
}: CatalogItemPageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = await getPublicStorefrontViewForRequest();
  const product = findPublicStorefrontProduct(view.catalog, slug);
  return product
    ? {
        title: product.name,
        description: `Browse supplied catalog configurations for ${product.name}.`,
      }
    : { title: "Catalog item unavailable" };
}

export default async function CatalogItemPage({ params }: CatalogItemPageProps) {
  const { slug } = await params;
  const [view, calculator, compoundResearch] = await Promise.all([
    getPublicStorefrontViewForRequest(),
    getPublicConcentrationCalculatorConfiguration(),
    publicCompoundResearch,
  ]);
  const product = findPublicStorefrontProduct(view.catalog, slug);
  if (!product) notFound();
  const relatedProducts = product.kind === "canonical"
    ? resolvePublicStorefrontRelatedProducts(view.catalog, product)
    : Object.freeze([]);
  const research = product.kind === "canonical"
    ? compoundResearch.compounds.find((entry) => entry.productSlug === product.slug) ?? null
    : null;

  return (
    <PageTransition>
      <CatalogItemDetail
        calculator={calculator}
        product={product}
        pricing={view.pricing}
        relatedProducts={relatedProducts}
        research={research}
      />
    </PageTransition>
  );
}
