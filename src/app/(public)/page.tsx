import { getPublicStorefrontCatalog } from "@/catalog/storefront-public-server";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export default async function HomePage() {
  const serverModule = await import("@/catalog/storefront-public-server");
  const [catalog, growth] = await Promise.all([
    ("getPublicStorefrontView" in serverModule ? serverModule.getPublicStorefrontView().then((view) => view) : getPublicStorefrontCatalog().then((catalog) => ({ catalog, pricing: undefined }))),
    getPublicGrowthProjection(),
  ]);

  return (
    <PageTransition>
      <PublicHome
        loyaltyPolicy={growth.status === "active" ? growth.projection.loyalty : null}
        referralPolicy={growth.status === "active" ? growth.projection.referral : null}
        syntheticLocal={growth.syntheticLocal === true}
        products={catalog.catalog.products}
        variantCount={catalog.catalog.displayConfigurationCount}
        pricing={catalog.pricing}
      />
    </PageTransition>
  );
}
