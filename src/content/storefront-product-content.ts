import { createHash } from "node:crypto";

import { browseCatalogProducts } from "@/catalog/browse-catalog";

import type { ControlledContentRecord } from "./storefront-content";

export type StorefrontProductContentProjection = Readonly<{
  description: string;
  contentIds: readonly [string, string, string];
}>;

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const APPROVAL_NOTE =
  "Catalog-derived descriptions and literature links, revised under the owner storefront-redesign request of 2026-09-06.";

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function uuidV5(name: string): string {
  const digest = createHash("sha1")
    .update(Buffer.concat([uuidBytes(DNS_NAMESPACE), Buffer.from(name)]))
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pubMedSearchUrl(term: string): string {
  const query = new URLSearchParams({ term });
  return `https://pubmed.ncbi.nlm.nih.gov/?${query.toString()}`;
}

const projections: [string, StorefrontProductContentProjection][] = [];
const contentRecords: ControlledContentRecord[] = [];

for (const product of browseCatalogProducts) {
  const descriptionContentId = uuidV5(
    `propeptiq.com/storefront/content/${product.slug}/description`,
  );
  const catalogContentId = uuidV5(
    `propeptiq.com/storefront/content/${product.slug}/catalog-record`,
  );
  const literatureContentId = uuidV5(
    `propeptiq.com/storefront/content/${product.slug}/pubmed-discovery`,
  );
  const description =
    `Explore ${product.name} amounts, pricing, and product information.`;
  const contentIds = Object.freeze([
    descriptionContentId,
    catalogContentId,
    literatureContentId,
  ] as const);

  projections.push([
    product.slug,
    Object.freeze({ description, contentIds }),
  ]);
  contentRecords.push(
    Object.freeze({
      id: descriptionContentId,
      kind: "product_description",
      status: "approved",
      title: "Product overview",
      body: description,
      sourceReferences: Object.freeze(["/catalog"]),
      approvalNote: APPROVAL_NOTE,
      reviewedAt: null,
      effectiveAt: null,
    }),
    Object.freeze({
      id: catalogContentId,
      kind: "product_information",
      status: "approved",
      title: "Product details",
      body: `Compare the listed amounts for ${product.name}. Select an amount to view its price and availability.`,
      sourceReferences: Object.freeze(["/catalog", "/research-use-policy"]),
      approvalNote: APPROVAL_NOTE,
      reviewedAt: null,
      effectiveAt: null,
    }),
    Object.freeze({
      id: literatureContentId,
      kind: "product_information",
      status: "approved",
      title: "PubMed literature discovery",
      body: `Search PubMed for literature about ${product.name}. Search results are provided for literature discovery only. They are not a curated study list, endorsement, product claim, or use guidance.`,
      sourceReferences: Object.freeze([pubMedSearchUrl(product.name)]),
      approvalNote: APPROVAL_NOTE,
      reviewedAt: null,
      effectiveAt: null,
    }),
  );
}

export const storefrontProductContentBySlug: Readonly<
  Record<string, StorefrontProductContentProjection>
> = Object.freeze(Object.fromEntries(projections));

export const storefrontProductContentRecords: readonly ControlledContentRecord[] =
  Object.freeze(contentRecords);

export function getStorefrontProductContent(
  slug: string,
): StorefrontProductContentProjection | null {
  return Object.hasOwn(storefrontProductContentBySlug, slug)
    ? storefrontProductContentBySlug[slug]!
    : null;
}
