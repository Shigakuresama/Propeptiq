import type { Metadata } from "next";

import { getPublicBrowseCatalog } from "@/catalog/browse-catalog-server";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Browse PROPEPTIQ LABS research catalog products and supplied package configurations.",
};

export default async function CatalogPage() {
  const catalog = await getPublicBrowseCatalog();

  return (
    <PageTransition>
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Owner-supplied catalog"
          title="Research catalog, organized by product."
          description={`${catalog.products.length} product families and ${catalog.variantCount} supplied package configurations. Prices and availability are intentionally excluded; imagery is an original illustrative presentation rather than product photography.`}
        />
        {catalog.products.length > 0 ? (
          <ul className="catalog-grid">
            {catalog.products.map((product, index) => (
              <li key={product.slug}>
                <CatalogListingCard product={product} priority={index < 3} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="record-sheet text-sm leading-6 text-muted-ink">
            No owner-approved browse catalog is currently published.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
