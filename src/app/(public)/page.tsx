import { getPublicStorefrontCatalog } from "@/catalog/storefront-public-server";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export default async function HomePage() {
  const [catalog, growth] = await Promise.all([
    getPublicStorefrontCatalog(),
    getPublicGrowthProjection(),
  ]);

  return (
    <PageTransition>
      <PublicHome
        loyaltyPolicy={growth.status === "active" ? growth.projection.loyalty : null}
        referralPolicy={growth.status === "active" ? growth.projection.referral : null}
        syntheticLocal={growth.syntheticLocal === true}
        products={catalog.products}
        variantCount={catalog.displayConfigurationCount}
      />
    </PageTransition>
  );
}
