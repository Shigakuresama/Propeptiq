import type { Metadata } from "next";

import { getPublicStorefrontCatalog } from "@/catalog/storefront-public-server";
import { CatalogExplorer } from "@/components/commerce/catalog-explorer";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Browse PROPEPTIQ LABS research catalog products and supplied package configurations.",
};

export default async function CatalogPage() {
  const serverModule = await import("@/catalog/storefront-public-server");
  const view = "getPublicStorefrontView" in serverModule ? await serverModule.getPublicStorefrontView() : null;
  const catalog = view?.catalog ?? await getPublicStorefrontCatalog();

  return (
    <PageTransition>
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Owner-supplied catalog"
          title="Research catalog, organized by product."
          description={`${catalog.products.length} product families and ${catalog.displayConfigurationCount} supplied package configurations. Prices and availability are intentionally excluded; imagery is an original illustrative presentation rather than product photography.`}
        />
        {catalog.products.length > 0 ? (
          <CatalogExplorer products={catalog.products} pricing={view?.pricing} />
        ) : (
          <p className="record-sheet text-base leading-7 text-muted-ink">
            No owner-approved browse catalog is currently published.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
