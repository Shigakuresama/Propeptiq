import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { CatalogSource, PublicProduct } from "@/catalog/types";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import { ProductTitleTransition } from "@/components/site/page-transition";

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function ProductCard({
  product,
  source,
}: {
  product: PublicProduct;
  source: CatalogSource;
}) {
  return (
    <article className="record-card flex h-full flex-col">
      {source === "synthetic-demo" ? (
        <p className="demo-label">Synthetic demo record</p>
      ) : null}
      {source === "synthetic-demo" ? (
        <div
          className="demo-geometry mt-5"
          role="img"
          aria-label="Abstract geometry for a synthetic demo record"
        >
          <span />
          <span />
        </div>
      ) : null}
      <ProductTitleTransition productId={product.id}>
        <h2 className="mt-7 font-heading text-3xl leading-tight text-ink">
          {product.name}
        </h2>
      </ProductTitleTransition>
      <p className="mt-3 text-sm leading-6 text-muted-ink">{product.packageForm}</p>
      <p className="mt-5 text-xl font-semibold tabular-nums text-ink">
        {formatMoney(product.price.amountMinor, product.price.currency)}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-ink">
        Server price. Tax, shipping, and final discounts are not yet calculated.
      </p>
      {product.merchandising.length > 0 ? (
        <ul className="mt-6 space-y-3 border-t border-border pt-5">
          {product.merchandising.map((entry) => (
            <li key={entry.id} className="text-sm leading-6 text-muted-ink">
              <span className="font-semibold text-ink">{entry.name}</span>
              <span className="block">{entry.summary}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-3 pt-8">
        <Link
          className="record-link inline-flex min-h-11 items-center gap-2"
          href={`/catalog/${product.slug}`}
          prefetch
          transitionTypes={["nav-forward"]}
        >
          View record
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <AddToCartButton
          variantId={null}
          productName={product.name}
          className="min-h-11"
        />
      </div>
    </article>
  );
}
