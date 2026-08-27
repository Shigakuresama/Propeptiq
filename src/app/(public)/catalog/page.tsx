import type { Metadata } from "next";

import { getPublicCatalog } from "@/catalog/server";
import { ProductCard } from "@/components/commerce/product-card";
import { CatalogEmptyState } from "@/components/site/catalog-empty-state";
import { DemoNotice } from "@/components/site/demo-notice";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Browse active server-projected research-use catalog records and prices.",
};

export default async function CatalogPage() {
  const catalog = await getPublicCatalog();

  return (
    <PageTransition>
      {catalog.source === "synthetic-demo" ? <DemoNotice /> : null}
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Public catalog"
          title="Active research-use catalog records."
          description="Names, package forms, prices, availability, and merchandising below come from the current server projection. Tax, shipping, final discounts, destination eligibility, and payment are not represented here."
        />
        {catalog.products.length === 0 ? (
          <CatalogEmptyState headingLevel="h2" />
        ) : (
          <ul className="catalog-grid">
            {catalog.products.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} source={catalog.source} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageTransition>
  );
}
