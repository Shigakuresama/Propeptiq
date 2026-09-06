import type { Metadata } from "next";

import { CartView } from "@/components/commerce/cart-view";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review your selected products, quantities, and order summary.",
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
          eyebrow="Shopping cart"
          title="Your cart"
          description="Review your selected products, quantities, and order summary."
        />
        <CartView checkoutIntent={checkoutIntent} />
      </div>
    </PageTransition>
  );
}
