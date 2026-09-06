import type { Metadata } from "next";

import { getPublicStorefrontView } from "@/catalog/storefront-public-server";
import { CatalogExplorer } from "@/components/commerce/catalog-explorer";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";
import { buildCatalogDiscoveryRows } from "@/search/catalog-discovery";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Explore PROPEPTIQ LABS research catalog products and configurations.",
};

export default async function CatalogPage() {
  const { catalog, pricing } = await getPublicStorefrontView();
  const allBrowseOnly = catalog.products.every((product) => product.kind === "browse_only");
  const discoveryRows = catalog.products.length > 0
    ? buildCatalogDiscoveryRows({ products: catalog.products, pricing })
    : null;

  return (
    <PageTransition>
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Research catalog"
          title="Explore the collection."
          description={`${catalog.products.length} products and ${catalog.displayConfigurationCount} configurations to explore. ${allBrowseOnly ? "Select a product to review its listed details. Pricing and ordering are not available for these items." : "Select a product to review its details, pricing, and availability."} Images are illustrations, not product photographs.`}
        />
        {discoveryRows !== null ? (
          <CatalogExplorer
            discoveryRows={discoveryRows}
            products={catalog.products}
            pricing={pricing}
          />
        ) : (
          <p className="record-sheet text-base leading-7 text-muted-ink">
            No products are available to view right now. Please check back later.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
