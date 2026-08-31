import { describe, expect, it } from "vitest";

import type {
  DatabaseCatalogPromotionRecord,
  DatabaseCatalogRecordSet,
} from "./database-catalog";
import { projectAutomaticStorefrontPromotions } from "./storefront-promotion-projection";

const now = new Date("2026-08-31T12:00:00.000Z");
const productId = "product-alpha";
const variantId = "variant-5mg";

function promotion(
  overrides: Partial<DatabaseCatalogPromotionRecord> = {},
): DatabaseCatalogPromotionRecord {
  return {
    id: "database-record-private",
    campaignKey: "winter30",
    code: "WINTER30",
    version: 7,
    name: "Winter Sale",
    kind: "discount",
    status: "active",
    enabled: true,
    timezone: "America/Los_Angeles",
    applicationMode: "automatic",
    scope: "sitewide",
    amountMinor: null,
    basisPoints: 3_000,
    currency: null,
    startsAt: null,
    endsAt: null,
    configuration: { private: "never serialize" },
    ...overrides,
  };
}

function records(
  promotions: readonly DatabaseCatalogPromotionRecord[],
  overrides: Partial<DatabaseCatalogRecordSet> = {},
): DatabaseCatalogRecordSet {
  return {
    source: "production",
    products: [{
      id: productId,
      slug: "product-alpha",
      name: "Synthetic Product Alpha",
      packageForm: "sealed fixture",
      materialIdentity: "Synthetic identity",
      policyGroupId: "policy-alpha",
      status: "active",
    }],
    variants: [{
      id: variantId,
      productId,
      sku: "TEST-5MG",
      label: "5 mg",
      canonicalAmount: 5,
      amountUnit: "mg",
      packageQuantity: 1,
      status: "active",
      stripeProductId: null,
      stripePriceId: null,
    }],
    prices: [],
    lots: [],
    coaDocuments: [],
    claims: [],
    promotions,
    promotionTargets: [],
    promotionVariantTargets: [],
    ...overrides,
  };
}

describe("automatic storefront promotion projection", () => {
  it("projects only the public allowlist and uses the stable campaign key as ID", () => {
    const result = projectAutomaticStorefrontPromotions({ records: records([promotion()]), now });

    expect(result.diagnostics).toEqual([]);
    expect(result.promotions).toEqual([{
      id: "winter30",
      displayName: "Winter Sale",
      displayCode: "WINTER30",
      discountBps: 3_000,
      enabled: true,
      startAt: null,
      endAt: null,
      timezone: "America/Los_Angeles",
      scope: { kind: "sitewide" },
      applicationMode: "automatic",
    }]);
    const serialized = JSON.stringify(result.promotions);
    expect(serialized).not.toContain("database-record-private");
    expect(serialized).not.toContain("version");
    expect(serialized).not.toContain("configuration");
    expect(serialized).not.toContain("percentage");
  });

  it.each([
    ["disabled", promotion({ enabled: false })],
    ["inactive status", promotion({ status: "draft" })],
    ["code required", promotion({ applicationMode: "code_required" })],
    ["scheduled", promotion({ startsAt: "2026-08-31T12:00:00.001Z" })],
    ["expired", promotion({ endsAt: "2026-08-31T12:00:00.000Z" })],
  ] as const)("silently omits a well-formed but inactive %s campaign", (_label, row) => {
    expect(projectAutomaticStorefrontPromotions({ records: records([row]), now })).toEqual({
      promotions: [], diagnostics: [],
    });
  });

  it("uses inclusive starts and exclusive ends", () => {
    const start = promotion({ id: "record-start", campaignKey: "starts-now", startsAt: now.toISOString() });
    const beforeEnd = promotion({ id: "record-end", campaignKey: "ends-later", endsAt: "2026-08-31T12:00:00.001Z" });
    const result = projectAutomaticStorefrontPromotions({ records: records([start, beforeEnd]), now });
    expect(result.promotions.map((entry) => entry.id)).toEqual(["ends-later", "starts-now"]);
  });

  it.each([
    ["non-ISO timestamp", promotion({ startsAt: "08/31/2026 12:00:00" }), "invalid_interval"],
    ["impossible timestamp", promotion({ startsAt: "2026-02-31T12:00:00.000Z" }), "invalid_interval"],
    ["inverted interval", promotion({ startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-08-31T00:00:00.000Z" }), "invalid_interval"],
    ["empty interval", promotion({ startsAt: "2026-08-31T12:00:00.000Z", endsAt: "2026-08-31T12:00:00.000Z" }), "invalid_interval"],
    ["invalid timezone", promotion({ timezone: "Mars/Olympus" }), "invalid_campaign"],
    ["blank campaign", promotion({ campaignKey: " " }), "invalid_campaign"],
    ["blank display name", promotion({ name: " " }), "invalid_campaign"],
    ["fixed amount", promotion({ amountMinor: 100 }), "invalid_campaign"],
    ["bad basis points", promotion({ basisPoints: 10_001 }), "invalid_campaign"],
  ] as const)("omits %s with a safe diagnostic", (_label, row, code) => {
    const result = projectAutomaticStorefrontPromotions({ records: records([row]), now });
    expect(result.promotions).toEqual([]);
    expect(result.diagnostics).toEqual([{ code, campaignKey: row.campaignKey?.trim() ? row.campaignKey : null }]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(row.id);
  });

  it("projects coherent product and variant scopes", () => {
    const productCampaign = promotion({ id: "record-product", campaignKey: "product30", scope: "products" });
    const variantCampaign = promotion({ id: "record-variant", campaignKey: "variant30", scope: "variants" });
    const result = projectAutomaticStorefrontPromotions({
      records: records([variantCampaign, productCampaign], {
        promotionTargets: [{ promotionId: productCampaign.id, targetKind: "product", productId, policyGroupId: null }],
        promotionVariantTargets: [{ promotionId: variantCampaign.id, variantId }],
      }),
      now,
    });
    expect(result.promotions.map((entry) => [entry.id, entry.scope])).toEqual([
      ["product30", { kind: "products", productIds: [productId] }],
      ["variant30", { kind: "variants", variantIds: [variantId] }],
    ]);
  });

  it.each([
    ["sitewide target", promotion(), { promotionTargets: [{ promotionId: "database-record-private", targetKind: "product" as const, productId, policyGroupId: null }] }, "invalid_scope"],
    ["empty product scope", promotion({ scope: "products" }), {}, "invalid_scope"],
    ["empty variant scope", promotion({ scope: "variants" }), {}, "invalid_scope"],
    ["policy group", promotion({ scope: "products" }), { promotionTargets: [{ promotionId: "database-record-private", targetKind: "policy_group" as const, productId: null, policyGroupId: "policy-alpha" }] }, "invalid_scope"],
    ["dangling product", promotion({ scope: "products" }), { promotionTargets: [{ promotionId: "database-record-private", targetKind: "product" as const, productId: "missing-product", policyGroupId: null }] }, "dangling_target"],
    ["dangling variant", promotion({ scope: "variants" }), { promotionVariantTargets: [{ promotionId: "database-record-private", variantId: "missing-variant" }] }, "dangling_target"],
    ["duplicate product", promotion({ scope: "products" }), { promotionTargets: [
      { promotionId: "database-record-private", targetKind: "product" as const, productId, policyGroupId: null },
      { promotionId: "database-record-private", targetKind: "product" as const, productId, policyGroupId: null },
    ] }, "invalid_scope"],
    ["duplicate variant", promotion({ scope: "variants" }), { promotionVariantTargets: [
      { promotionId: "database-record-private", variantId },
      { promotionId: "database-record-private", variantId },
    ] }, "invalid_scope"],
    ["mixed product and variant", promotion({ scope: "products" }), {
      promotionTargets: [{ promotionId: "database-record-private", targetKind: "product" as const, productId, policyGroupId: null }],
      promotionVariantTargets: [{ promotionId: "database-record-private", variantId }],
    }, "invalid_scope"],
    ["unknown scope", promotion({ scope: "collection" as never }), {}, "invalid_scope"],
  ] as const)("omits the complete promotion for %s", (_label, row, targetOverrides, code) => {
    const result = projectAutomaticStorefrontPromotions({ records: records([row], targetOverrides), now });
    expect(result.promotions).toEqual([]);
    expect(result.diagnostics).toEqual([{ code, campaignKey: "winter30" }]);
  });

  it("detects duplicate public keys only among otherwise-valid active automatic rows", () => {
    const duplicate = promotion({ id: "duplicate-active" });
    const scheduled = promotion({ id: "duplicate-scheduled", startsAt: "2026-09-01T00:00:00.000Z" });
    const codeRequired = promotion({ id: "duplicate-code", applicationMode: "code_required" });
    const malformed = promotion({ id: "duplicate-malformed", timezone: "not-a-timezone" });

    expect(projectAutomaticStorefrontPromotions({ records: records([promotion(), duplicate]), now })).toEqual({
      promotions: [],
      diagnostics: [{ code: "duplicate_campaign_key", campaignKey: "winter30" }],
    });
    expect(projectAutomaticStorefrontPromotions({ records: records([promotion(), scheduled, codeRequired, malformed]), now })).toMatchObject({
      promotions: [{ id: "winter30" }],
      diagnostics: [{ code: "invalid_campaign", campaignKey: "winter30" }],
    });
  });

  it("returns deterministic promotion and diagnostic order", () => {
    const result = projectAutomaticStorefrontPromotions({
      records: records([
        promotion({ id: "record-z", campaignKey: "zeta" }),
        promotion({ id: "record-bad-z", campaignKey: "bad-z", timezone: "bad" }),
        promotion({ id: "record-a", campaignKey: "alpha" }),
        promotion({ id: "record-bad-a", campaignKey: "bad-a", startsAt: "not-iso" }),
      ]),
      now,
    });
    expect(result.promotions.map((entry) => entry.id)).toEqual(["alpha", "zeta"]);
    expect(result.diagnostics).toEqual([
      { code: "invalid_interval", campaignKey: "bad-a" },
      { code: "invalid_campaign", campaignKey: "bad-z" },
    ]);
  });

  it("fails closed for an invalid evaluation instant", () => {
    expect(projectAutomaticStorefrontPromotions({ records: records([promotion()]), now: new Date(Number.NaN) })).toEqual({
      promotions: [], diagnostics: [{ code: "invalid_interval", campaignKey: null }],
    });
  });
});
