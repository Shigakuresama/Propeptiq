import { describe, expect, it } from "vitest";

import { parseCheckoutRequest } from "@/domain/checkout";
import { syntheticDemoCatalogRecords } from "./demo-fixtures";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

describe("synthetic demo catalog relational fixture", () => {
  it("uses valid UUIDs for every identifier and preserves every relationship", () => {
    const records = syntheticDemoCatalogRecords;
    const productIds = new Set(records.products.map(({ id }) => id));
    const policyGroupIds = new Set(
      records.products.map(({ policyGroupId }) => policyGroupId),
    );
    const lotIds = new Set(records.lots.map(({ id }) => id));
    const coaIds = new Set(records.coaDocuments.map(({ id }) => id));
    const promotionIds = new Set(records.promotions.map(({ id }) => id));
    const configurationProductIds = records.promotions.flatMap((promotion) => {
      if (
        promotion.configuration === null ||
        typeof promotion.configuration !== "object" ||
        !("productIds" in promotion.configuration) ||
        !Array.isArray(promotion.configuration.productIds)
      ) {
        return [];
      }
      return promotion.configuration.productIds.filter(
        (id): id is string => typeof id === "string",
      );
    });
    const allIds = [
      ...records.products.flatMap((record) => [record.id, record.policyGroupId]),
      ...records.prices.flatMap((record) => [record.id, record.productId]),
      ...records.lots.flatMap((record) => [record.id, record.productId]),
      ...records.coaDocuments.flatMap((record) => [record.id, record.lotId]),
      ...records.claims.flatMap((record) => [record.id, record.productId, record.lotId, record.coaDocumentId]),
      ...records.promotions.map((record) => record.id),
      ...records.promotionTargets.flatMap((record) => [record.promotionId, record.productId, record.policyGroupId].filter((id): id is string => id !== null)),
      ...configurationProductIds,
    ];
    expect(allIds.every((id) => uuid.test(id))).toBe(true);
    expect(records.prices.every(({ productId }) => productIds.has(productId))).toBe(true);
    expect(records.lots.every(({ productId }) => productIds.has(productId))).toBe(true);
    expect(records.coaDocuments.every(({ lotId }) => lotIds.has(lotId))).toBe(true);
    expect(
      records.claims.every(({ productId, lotId, coaDocumentId }) => {
        const lot = records.lots.find(({ id }) => id === lotId);
        const coa = records.coaDocuments.find(({ id }) => id === coaDocumentId);
        return productIds.has(productId) && lotIds.has(lotId) &&
          coaIds.has(coaDocumentId) && lot?.productId === productId &&
          coa?.lotId === lotId;
      }),
    ).toBe(true);
    expect(
      records.promotionTargets.every(
        ({ promotionId, productId, policyGroupId }) =>
          promotionIds.has(promotionId) &&
          (productId === null || productIds.has(productId)) &&
          (policyGroupId === null || policyGroupIds.has(policyGroupId)),
      ),
    ).toBe(true);
    expect(configurationProductIds.every((id) => productIds.has(id))).toBe(true);
    expect(records.promotions.every(({ code, version }) => typeof code === "string" && code.length > 0 && Number.isSafeInteger(version) && version > 0)).toBe(true);
  });

  it("passes actual demo product and promotion IDs through the strict checkout parser", () => {
    const result = parseCheckoutRequest({
      items: [{ productId: syntheticDemoCatalogRecords.products[0]!.id, quantity: 1 }],
      destination: {
        recipientName: "Synthetic Researcher",
        line1: "100 Test Avenue",
        line2: null,
        city: "San Diego",
        stateCode: "CA",
        postalCode: "92101",
        countryCode: "US",
      },
      promotionIds: [syntheticDemoCatalogRecords.promotions[0]!.id],
    });
    expect(result).toMatchObject({ ok: true });
  });
});
