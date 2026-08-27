import type { Metadata } from "next";

import { CartView } from "@/components/commerce/cart-view";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review locally requested product IDs against authoritative server facts.",
};

type CartPageProps = {
  searchParams: Promise<{ checkout?: string | string[] }>;
};

export default async function CartPage({ searchParams }: CartPageProps) {
  const query = await searchParams;
  const checkoutIntent =
    typeof query.checkout === "string" ? query.checkout : null;

  return (
    <PageTransition>
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Anonymous cart"
          title="Requested IDs, reconciled with server facts."
          description="This browser stores only product IDs and quantities. Names, prices, availability, promotions, totals, destination, tax, and shipping remain server-owned."
        />
        <CartView checkoutIntent={checkoutIntent} />
      </div>
    </PageTransition>
  );
}
