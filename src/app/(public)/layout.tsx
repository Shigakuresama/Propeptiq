import type { ReactNode } from "react";

import { getStorefrontPromotionBannerView } from "@/catalog/storefront-promotion-banner-server";
import { SiteSearchLauncher } from "@/components/search/site-search-launcher";
import { PromotionBar } from "@/components/site/promotion-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const promotion = await getStorefrontPromotionBannerView();

  return (
    <div className="public-layout">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <PromotionBar promotion={promotion} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
      <SiteSearchLauncher />
    </div>
  );
}
