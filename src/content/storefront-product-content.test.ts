import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "@/catalog/browse-catalog";
import { scanPublicCopy } from "@/domain/content-policy";
import { getApprovedStorefrontContent } from "./storefront-content";
import {
  getStorefrontProductContent,
  storefrontProductContentBySlug,
  storefrontProductContentRecords,
} from "./storefront-product-content";

const contentId = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const publicationPolicy = Object.freeze({
  version: "owner-approved-neutral-product-content-v1",
  activeLotEvidenceIds: Object.freeze([] as string[]),
});

describe("storefront product controlled content", () => {
  it("covers every owner catalog product with one description and three stable content IDs", () => {
    expect(browseCatalogProducts).toHaveLength(56);
    expect(Object.keys(storefrontProductContentBySlug)).toEqual(
      browseCatalogProducts.map((product) => product.slug),
    );

    const allIds: string[] = [];
    for (const product of browseCatalogProducts) {
      const projection = getStorefrontProductContent(product.slug);
      expect(projection).not.toBeNull();
      expect(projection?.description).toContain(product.name);
      expect(projection?.contentIds).toHaveLength(3);
      expect(projection?.contentIds.every((id) => contentId.test(id))).toBe(true);
      expect(Object.isFrozen(projection)).toBe(true);
      expect(Object.isFrozen(projection?.contentIds)).toBe(true);
      allIds.push(...(projection?.contentIds ?? []));
    }

    expect(allIds).toHaveLength(168);
    expect(new Set(allIds).size).toBe(168);
    expect(getStorefrontProductContent("not-an-owner-product")).toBeNull();
  });

  it("publishes a distinct overview, catalog record, and PubMed discovery record per product", () => {
    expect(storefrontProductContentRecords).toHaveLength(168);
    expect(getApprovedStorefrontContent(storefrontProductContentRecords)).toHaveLength(168);

    const recordsById = new Map(
      storefrontProductContentRecords.map((record) => [record.id, record] as const),
    );
    for (const product of browseCatalogProducts) {
      const projection = getStorefrontProductContent(product.slug)!;
      const descriptionRecord = recordsById.get(projection.contentIds[0]);
      const catalogRecord = recordsById.get(projection.contentIds[1]);
      const literatureRecord = recordsById.get(projection.contentIds[2]);

      expect(descriptionRecord).toMatchObject({
        kind: "product_description",
        status: "approved",
        title: "Product overview",
        body: projection.description,
      });

      expect(catalogRecord).toMatchObject({
        kind: "product_information",
        status: "approved",
        title: "Catalog record",
      });
      expect(catalogRecord?.body).toContain(product.name);
      expect(literatureRecord).toMatchObject({
        kind: "product_information",
        status: "approved",
        title: "PubMed literature discovery",
      });
      expect(literatureRecord?.body).toContain(product.name);
      expect(literatureRecord?.body).toContain("literature discovery only");
      expect(literatureRecord?.body).toContain("not a curated study list, endorsement, product claim, or use guidance");

      const sourceUrl = new URL(literatureRecord!.sourceReferences[0]!);
      expect(sourceUrl.origin).toBe("https://pubmed.ncbi.nlm.nih.gov");
      expect(sourceUrl.pathname).toBe("/");
      expect([...sourceUrl.searchParams.keys()]).toEqual(["term"]);
      expect(sourceUrl.searchParams.get("term")).toBe(product.name);
      expect(literatureRecord?.sourceReferences).toHaveLength(1);
      expect(catalogRecord?.body).not.toBe(projection.description);
    }
  });

  it("keeps every description and approved body neutral under the public-copy policy", () => {
    const allCopy = [
      ...Object.values(storefrontProductContentBySlug).map((entry) => entry.description),
      ...storefrontProductContentRecords.map((record) => `${record.title} ${record.body}`),
    ];

    for (const text of allCopy) {
      expect(scanPublicCopy({ text, claims: [] }, publicationPolicy)).toMatchObject({
        publishable: true,
        status: "pass",
        violations: [],
      });
    }
    expect(allCopy.join(" ")).not.toMatch(
      /Amino Club|purity|steril|tested|testing|shipping|guarantee|dose|dosage|administer|inject|treat|patient|medical advice/iu,
    );
  });

  it("deep-freezes records and lookup entries without exposing mutable source arrays", () => {
    expect(Object.isFrozen(storefrontProductContentBySlug)).toBe(true);
    expect(Object.isFrozen(storefrontProductContentRecords)).toBe(true);
    for (const record of storefrontProductContentRecords) {
      expect(Object.isFrozen(record)).toBe(true);
      expect(Object.isFrozen(record.sourceReferences)).toBe(true);
    }
    for (const entry of Object.values(storefrontProductContentBySlug)) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.contentIds)).toBe(true);
    }
  });
});
