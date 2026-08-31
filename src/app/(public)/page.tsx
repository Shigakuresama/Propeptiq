import { getPublicStorefrontView } from "@/catalog/storefront-public-server";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export default async function HomePage() {
  const [storefront, growth] = await Promise.all([
    getPublicStorefrontView(),
    getPublicGrowthProjection(),
  ]);

  return (
    <PageTransition>
      <PublicHome
        loyaltyPolicy={growth.status === "active" ? growth.projection.loyalty : null}
        referralPolicy={growth.status === "active" ? growth.projection.referral : null}
        syntheticLocal={growth.syntheticLocal === true}
        products={storefront.catalog.products}
        variantCount={storefront.catalog.displayConfigurationCount}
        pricing={storefront.pricing}
      />
    </PageTransition>
  );
}
