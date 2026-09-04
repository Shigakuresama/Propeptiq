import { createHash } from "node:crypto";

import { browseCatalogProducts } from "@/catalog/browse-catalog";

import type { ControlledContentRecord } from "./storefront-content";

export type StorefrontProductContentProjection = Readonly<{
  description: string;
  contentIds: readonly [string, string];
}>;

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const APPROVAL_NOTE = "Owner-approved neutral storefront content.";
const REVIEWED_AT = "2026-09-04T00:00:00.000-07:00";

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
  const catalogContentId = uuidV5(
    `propeptiq.com/storefront/content/${product.slug}/catalog-record`,
  );
  const literatureContentId = uuidV5(
    `propeptiq.com/storefront/content/${product.slug}/pubmed-discovery`,
  );
  const description =
    `${product.name} is an owner-supplied catalog identity in the ${product.category} category. Review its published configurations and current purchase state separately.`;
  const contentIds = Object.freeze([
    catalogContentId,
    literatureContentId,
  ] as const);

  projections.push([
    product.slug,
    Object.freeze({ description, contentIds }),
  ]);
  contentRecords.push(
    Object.freeze({
      id: catalogContentId,
      kind: "product_information",
      status: "approved",
      title: "Catalog record",
      body: `This page presents the owner-supplied identity for ${product.name} and its published package configurations. Pricing, availability, and checkout readiness are separate record states and may be unavailable.`,
      sourceReferences: Object.freeze(["/catalog", "/research-use-policy"]),
      approvalNote: APPROVAL_NOTE,
      reviewedAt: REVIEWED_AT,
      effectiveAt: null,
    }),
    Object.freeze({
      id: literatureContentId,
      kind: "product_information",
      status: "approved",
      title: "PubMed literature discovery",
      body: `Open the linked PubMed search for the exact owner-supplied catalog name “${product.name}.” Search results are provided for literature discovery only. They are not a curated study list, endorsement, product claim, or use guidance.`,
      sourceReferences: Object.freeze([pubMedSearchUrl(product.name)]),
      approvalNote: APPROVAL_NOTE,
      reviewedAt: REVIEWED_AT,
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
