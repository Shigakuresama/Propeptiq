import { getPublicBrowseCatalog } from "@/catalog/browse-catalog-server";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export default async function HomePage() {
  const [catalog, growth] = await Promise.all([
    getPublicBrowseCatalog(),
    getPublicGrowthProjection(),
  ]);

  return (
    <PageTransition>
      <PublicHome
        loyaltyPolicy={growth?.loyalty ?? null}
        products={catalog.products}
        variantCount={catalog.variantCount}
      />
    </PageTransition>
  );
}
