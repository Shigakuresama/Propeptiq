import { getPublicStorefrontView } from "@/catalog/storefront-public-server";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";
import { getPublicStorefrontContentView } from "@/content/storefront-public-content-server";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

async function loadPublicStorefrontContentSafely() {
  try {
    return await getPublicStorefrontContentView();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [storefront, growth, content] = await Promise.all([
    getPublicStorefrontView(),
    getPublicGrowthProjection(),
    loadPublicStorefrontContentSafely(),
  ]);

  return (
    <PageTransition>
      <PublicHome
        homepageContent={content?.homepage}
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
