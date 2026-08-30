import type { Metadata } from "next";

import { getPublicBrowseCatalog } from "@/catalog/browse-catalog-server";
import { CatalogExplorer } from "@/components/commerce/catalog-explorer";
import {
  DataLabel,
  RecordPanel,
} from "@/components/design-system/archive-primitives";
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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] xl:items-center xl:gap-16">
          <PageIntro
            eyebrow="Owner-supplied catalog"
            title="Research catalog, organized as an index."
            description="Browse exact owner-supplied names, source codes, and package configurations. Prices and availability are intentionally excluded; imagery is an original illustrative presentation rather than product photography."
          />
          <RecordPanel className="mb-10 p-5 sm:mb-12 sm:p-8 xl:my-24">
            <DataLabel>Publication manifest</DataLabel>
            <div className="mt-5 grid grid-cols-2 gap-5 border-y border-border py-5 sm:mt-6 sm:gap-6 sm:py-6">
              <div>
                <DataLabel>Families</DataLabel>
                <p className="metric-value mt-2 text-ink">{catalog.products.length}</p>
                <p className="mt-3 hidden text-base leading-7 text-muted-ink sm:block">
                  owner-supplied product families
                </p>
              </div>
              <div>
                <DataLabel>Configurations</DataLabel>
                <p className="metric-value mt-2 text-ink">{catalog.variantCount}</p>
                <p className="mt-3 hidden text-base leading-7 text-muted-ink sm:block">
                  {catalog.variantCount} supplied package configurations
                </p>
              </div>
            </div>
            <p className="mt-5 hidden text-sm leading-6 text-muted-ink sm:block">
              Publication scope is browse-only. Each dossier reproduces supplied catalog
              facts without adding commerce or quality claims.
            </p>
          </RecordPanel>
        </div>
        {catalog.products.length > 0 ? (
          <CatalogExplorer products={catalog.products} />
        ) : (
          <p className="record-sheet text-base leading-7 text-muted-ink">
            No owner-approved browse catalog is currently published.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
