"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import {
  resolvePublicVariantPrice,
  type PublicStorefrontPricingContext,
} from "@/catalog/storefront-price-presentation";
import type { PublicConcentrationCalculatorConfiguration } from "@/domain/concentration";
import type { PublicCompoundResearchEntry } from "@/content/compound-research-public";
import { CompoundResearchSection } from "./compound-research-section";
import { CatalogProductVisual } from "./catalog-product-visual";
import { LaboratoryConcentrationCalculator } from "./laboratory-concentration-calculator";
import { CompoundInformationSection } from "./compound-information-section";
import { getCompoundInformation } from "@/content/compound-information";
import { ProductInformationSections } from "./product-information-sections";
import { ProductPurchasePanel } from "./product-purchase-panel";
import { RelatedProductsCarousel } from "./related-products-carousel";

export function CatalogItemDetail({ calculator, product, pricing, relatedProducts, research = null }: { calculator: PublicConcentrationCalculatorConfiguration | null; product: PublicStorefrontProduct; pricing: PublicStorefrontPricingContext; relatedProducts: readonly Extract<PublicStorefrontProduct, { kind: "canonical" }>[]; research?: PublicCompoundResearchEntry | null }) {
  const canonical = product.kind === "canonical";
  const compoundProfile = getCompoundInformation(product.slug);
  const supplementalRecords = canonical ? product.content.filter((record) => {
    if (!compoundProfile || record.kind !== "product_information") return true;
    const genericDetails = record.title === "Product details" &&
      record.body === `Compare the listed amounts for ${compoundProfile.name}. Select an amount to view its price and availability.`;
    const genericDiscovery = record.title === "PubMed literature discovery" &&
      record.body === `Search PubMed for literature about ${compoundProfile.name}. Search results are provided for literature discovery only. They are not a curated study list, endorsement, product claim, or use guidance.`;
    return !genericDetails && !genericDiscovery;
  }) : [];
  const configuredDefaultVariantId = product.kind === "canonical" && product.variants.some(
    (variant) => variant.id === product.defaultVariantId,
  )
    ? product.defaultVariantId
    : null;
  const [purchaseSelection, setPurchaseSelection] = useState(() => ({
    productSlug: product.slug,
    quantity: 1 as number | null,
    variantId: configuredDefaultVariantId,
  }));
  const selectedVariantId = purchaseSelection.productSlug === product.slug
    ? purchaseSelection.variantId
    : configuredDefaultVariantId;
  const selectedQuantity = purchaseSelection.productSlug === product.slug
    ? purchaseSelection.quantity
    : 1;
  const sourceLabelIsDistinct =
    product.sourceName.replace(/\s+/gu, "").toLocaleLowerCase("en-US") !==
    product.name.replace(/\s+/gu, "").toLocaleLowerCase("en-US");
  const visualVariant = product.kind === "canonical"
    ? product.variants.find((variant) => variant.id === selectedVariantId)
    : undefined;
  const visualVariantLabel = product.kind === "canonical"
    ? visualVariant?.label
    : product.displayConfigurations[0]?.packageForm;
  const visualPrice = product.kind === "canonical" && visualVariant && selectedQuantity !== null
    ? resolvePublicVariantPrice({
        variant: visualVariant,
        productId: product.id,
        quantity: selectedQuantity,
        pricing,
      })
    : null;
  const visualDiscountPercent = visualPrice?.state === "priced" &&
      visualVariant?.priceStatus === "active" &&
      visualVariant.availability !== "unavailable"
    ? visualPrice.price.effectiveDiscountBps / 100
    : undefined;

  return (
    <article className="site-container pb-16 pt-4 md:pt-6">
      <Link
        className="record-link inline-flex min-h-11 items-center gap-2"
        href="/catalog"
        transitionTypes={["nav-back"]}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to catalog
      </Link>

      <div className="product-detail-grid mt-4 grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-0">
        <header
          className="min-w-0 lg:col-start-2 lg:row-start-1"
          data-motion-sequence="dossier-intro"
        >
          <p className="eyebrow" data-motion-step="1">
            Product details
          </p>
          <h1
            className="catalog-detail-heading mt-2 text-balance font-heading text-section leading-[1.12] text-ink [overflow-wrap:anywhere]"
            data-motion-step="2"
          >
            {product.name}
          </h1>
          {canonical && product.description ? (
            <p
              className="mt-3 max-w-prose text-sm leading-6 text-muted-ink"
              data-motion-step="3"
            >
              {product.description}
            </p>
          ) : null}
          {sourceLabelIsDistinct ? (
            <p
              className="mt-4 text-sm leading-6 text-muted-ink"
              data-motion-step={canonical && product.description ? "4" : "3"}
            >
              Also listed as {product.sourceName}
            </p>
          ) : null}
        </header>

        <div
          className="catalog-detail-image mt-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0"
        >
          <CatalogProductVisual
            product={product}
            variantLabel={visualVariantLabel}
            variantId={visualVariant?.id}
            discountPercent={visualDiscountPercent}
            priority
          />
        </div>

        <div className="catalog-detail-content min-w-0 [overflow-wrap:anywhere] lg:col-start-2 lg:row-start-2 lg:pt-0">
          {canonical ? (
            <ProductPurchasePanel
              key={product.slug}
              onSelectedQuantityChange={(quantity) => setPurchaseSelection((selection) => ({
                productSlug: product.slug,
                quantity,
                variantId: selection.productSlug === product.slug
                  ? selection.variantId
                  : configuredDefaultVariantId,
              }))}
              onSelectedVariantIdChange={(variantId) => setPurchaseSelection((selection) => ({
                productSlug: product.slug,
                quantity: selection.productSlug === product.slug ? selection.quantity : 1,
                variantId,
              }))}
              product={product}
              pricing={pricing}
              selectedVariantId={selectedVariantId}
            />
          ) : null}
          {!canonical ? <p className="info-record mt-8 text-sm">Product details are shown above. Pricing and ordering are not available for this item.</p> : null}
        </div>
      </div>
      <CompoundInformationSection product={product} />
      {canonical ? <ProductInformationSections records={supplementalRecords} /> : null}
      {canonical ? <CompoundResearchSection research={research} /> : null}
      {canonical && calculator ? (
        <LaboratoryConcentrationCalculator calculator={calculator} />
      ) : null}
      {canonical ? <RelatedProductsCarousel currentProductId={product.id} products={relatedProducts} pricing={pricing} /> : null}
    </article>
  );
}
