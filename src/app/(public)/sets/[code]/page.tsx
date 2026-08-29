import type { Metadata } from "next";
import Link from "next/link";

import { AddSetToCartButton } from "@/components/growth/add-set-to-cart-button";
import { SharedSetCard } from "@/components/growth/shared-set-card";
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
    <div className="site-container py-16">
      {"syntheticLocal" in result && result.syntheticLocal === true ? (
        <p className="warning-record mb-6 text-base font-semibold">Synthetic local test only</p>
      ) : null}
      <SharedSetCard
        variant="public"
        label={result.set.label}
        items={result.set.items}
        omissionNotice={result.set.omissionNotice}
        actions={<AddSetToCartButton items={result.set.items} />}
      />
    </div>
  );
}
