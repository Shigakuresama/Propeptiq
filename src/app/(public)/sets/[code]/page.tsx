import type { Metadata } from "next";
import Link from "next/link";

import { AddSetToCartButton } from "@/components/growth/add-set-to-cart-button";
import { loadPublicSharedSet } from "@/growth/shared-set-server";

export const metadata: Metadata = {
  title: "Shared research set",
  description: "A neutral research set resolved from current public catalog records.",
};

export default async function SharedSetPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await loadPublicSharedSet(code);
  if (result.status !== "available") {
    return (
      <section className="site-container py-16">
        <h1 className="font-heading text-page">Research set unavailable</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-ink">
          This link cannot be displayed. Browse the current catalog for available research records.
        </p>
        <Link className="record-link mt-6 inline-flex min-h-11 items-center" href="/catalog">
          Browse catalog
        </Link>
      </section>
    );
  }

  return (
    <article className="site-container py-16">
      <p className="eyebrow">Shared research set</p>
      <h1 className="mt-4 font-heading text-page">{result.set.label}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-ink">
        Product details are resolved from the current public catalog. This set carries quantities only.
      </p>
      {result.set.omissionNotice ? (
        <p className="info-record mt-6">{result.set.omissionNotice}</p>
      ) : null}
      {result.set.items.length > 0 ? (
        <>
          <ul className="mt-8 grid gap-4 p-0">
            {result.set.items.map((item) => (
              <li className="record-card" key={item.productId}>
                <Link className="record-link text-lg font-semibold" href={`/catalog/${item.slug}`}>
                  {item.name}
                </Link>
                <p className="mt-2 text-base text-muted-ink">{item.packageForm} · Quantity {item.quantity}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <AddSetToCartButton items={result.set.items} />
          </div>
        </>
      ) : (
        <p className="empty-record mt-8">No saved products remain in the current public catalog.</p>
      )}
    </article>
  );
}
