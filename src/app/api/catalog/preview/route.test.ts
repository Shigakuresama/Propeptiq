import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildConfiguredDisplayVariantFacts,
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import type { PricePresentationMode } from "@/catalog/storefront-price-presentation";
import { parseServerEnv } from "@/config/env-schema";
import { WINTER30_STOREFRONT_PROMOTION } from "@/config/storefront-promotions";
import * as previewModel from "@/cart/preview";
import { canContinueFromPreview, type CartPreview } from "@/cart/preview-types";

// Test doubles replace request acquisition only; projection, pricing, and the
// accessor's missing-schema fallback are exercised through their real code.
const { getRequestIdentity, getPublicStorefrontView, cartPreviewSource } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(), getPublicStorefrontView: vi.fn(), cartPreviewSource: vi.fn(),
}));
vi.mock("@/auth/server", () => ({ getRequestIdentity }));
vi.mock("@/catalog/storefront-public-server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/catalog/storefront-public-server")>(),
  getPublicStorefrontView,
}));

import { loadPublicStorefrontView, type PublicStorefrontView } from "@/catalog/storefront-public-server";
import * as route from "./route";

const { POST } = route;
const publicVariantId = "5ff78cc3-c541-5bf4-9f3b-12be2222cc75";
const syntheticVariantId = "55000000-0000-4000-8000-000000000001";
const syntheticVariant: previewModel.CartPreviewVariant = {
  variantId: syntheticVariantId,
  productId: "61000000-0000-4000-8000-000000000001",
  name: "Synthetic Reference Alpha — Demo Only", packageForm: "Synthetic sealed reference unit",
  variantLabel: "Synthetic 5 mg fixture", sku: "SYNTHETIC-ALPHA-5MG",
  baseUnitMinor: 2_400, currency: "USD", priceStatus: "active", availability: "available",
  availableQuantity: 12, checkoutReady: true, eligiblePromotions: [],
};
// Explicit synthetic local-harness configuration, never a production secret.
const localEnvironment = {
  APP_ENV: "local", APP_ORIGIN: "http://127.0.0.1:4631", CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "enabled", LOCAL_TEST_SECRET: "catalog-preview-local-secret-at-least-32-characters",
  RATE_LIMIT_SECRET: "catalog-preview-rate-secret-at-least-32-characters", VERCEL_ENV: "development",
  VERCEL_TARGET_ENV: "development", AUTH_MODE: "disabled", DATABASE_MODE: "disabled",
  PAYMENTS_MODE: "disabled", STORAGE_MODE: "disabled", EMAIL_MODE: "disabled", TAX_MODE: "test",
  SHIPPING_MODE: "test", FULFILLMENT_MODE: "test", COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
};
const catalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId, catalogData: storefrontCatalogData,
  runtimeVariantFacts: buildConfiguredDisplayVariantFacts(storefrontCatalogData), controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});
const tirzepatide = catalog.products.find((product) => product.slug === "tirzepatide");
if (!tirzepatide || tirzepatide.kind !== "canonical") throw new Error("Canonical Tirzepatide is required for this test");
const canonicalProduct = tirzepatide;
const canonicalVariant = canonicalProduct.variants.find((variant) => variant.id === publicVariantId)!;

function publicView(mode: PricePresentationMode = "production"): PublicStorefrontView {
  return { catalog, pricing: { mode, evaluatedAt: "2026-09-03T12:00:00.000Z", automaticPromotions: [WINTER30_STOREFRONT_PROMOTION] } };
}
function rawRequest(body: string) {
  return new Request("http://127.0.0.1:4631/api/catalog/preview", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });
}
function request(payload: unknown = { items: [{ variantId: publicVariantId, quantity: 2 }] }) {
  return rawRequest(JSON.stringify(payload));
}
function expectedPublicLine(purchaseState: "checkout_unavailable" | "local_preview" = "checkout_unavailable") {
  return {
    variantId: publicVariantId, quantity: 2, available: false, purchaseState,
    name: "Tirzepatide", variantLabel: "30mg", sku: "PPQ-TIRZEPATIDE-TR30", packageForm: "1 bottle",
    baseUnitMinor: 5_999, unitAmountMinor: 4_199, lineSubtotalMinor: 8_398, lineSavingsMinor: 3_600,
    effectiveDiscountBps: 3_000, appliedPromotions: [{ id: "winter30", label: "WINTER30" }], currency: "USD",
  };
}
async function expectUnavailable(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    error: "cart_preview_unavailable", message: "The cart preview is temporarily unavailable.",
  });
}

describe("POST /api/catalog/preview public display boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPublicStorefrontView.mockResolvedValue(publicView());
    getRequestIdentity.mockResolvedValue({ environment: { ...localEnvironment, APP_ENV: "production" }, localDriver: null });
    cartPreviewSource.mockReturnValue({ variants: [syntheticVariant] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("exposes only supported Next route exports", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic"]);
    expect(route.dynamic).toBe("force-dynamic");
  });

  it.each(["", "{", '{"items":'])("rejects malformed JSON %j before dependencies", async (body) => {
    const response = await POST(rawRequest(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "invalid_request", message: "A JSON cart request is required." });
    expect(getPublicStorefrontView).not.toHaveBeenCalled();
    expect(getRequestIdentity).not.toHaveBeenCalled();
  });

  it.each([[null], [[]], [[{ variantId: publicVariantId, quantity: 2 }]], ["cart"], [2], [true], [false]] as const)(
    "rejects non-object JSON %j before dependencies", async (payload) => {
      const response = await POST(request(payload));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "invalid_request", message: "A cart request object is required." });
      expect(getPublicStorefrontView).not.toHaveBeenCalled();
      expect(getRequestIdentity).not.toHaveBeenCalled();
    },
  );

  it.each(["production", "preview"] as const)("hydrates canonical Tirzepatide once in %s without checkout authority", async (mode) => {
    getPublicStorefrontView.mockResolvedValue(publicView(mode));
    getRequestIdentity.mockResolvedValue({ environment: { ...localEnvironment, APP_ENV: mode }, localDriver: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const preview: CartPreview = await response.json();
    expect(preview.items).toEqual([expectedPublicLine(mode === "production" ? "checkout_unavailable" : "local_preview")]);
    expect(preview).toMatchObject({ schemaVersion: 2, subtotalMinor: 8_398, currency: "USD", taxMinor: null,
      shippingMinor: null, finalDiscountMinor: null, reasons: ["checkout_unavailable"], requiresAcknowledgement: true });
    expect(getPublicStorefrontView).toHaveBeenCalledExactlyOnceWith();
    expect(getRequestIdentity).toHaveBeenCalledExactlyOnceWith();
    expect(canContinueFromPreview(preview, null)).toBe(false);
    expect(canContinueFromPreview(preview, preview.previewToken)).toBe(false);
  });

  it("keeps the public view's mode instead of deriving it from request identity", async () => {
    getRequestIdentity.mockResolvedValue({ environment: localEnvironment, localDriver: null });
    expect((await (await POST(request())).json()).items).toEqual([expectedPublicLine()]);
  });

  it("ignores client display, pricing, availability, inventory, and provider claims", async () => {
    const clean = await (await POST(request())).json();
    const claims = { name: "Tampered name", variantLabel: "Tampered label", sku: "TAMPERED", price: 1,
      baseUnitMinor: 1, unitAmountMinor: 1, discount: 100, subtotalMinor: 1, promotion: "tampered",
      availability: "available", available: true, inventory: 100, checkoutReady: true,
      stripePriceId: "price_test_tampered", stripeProductId: "prod_test_tampered", provider: "test-provider" };
    const tampered = await (await POST(request({ ...claims,
      items: [{ ...claims, variantId: publicVariantId, quantity: 2 }], previousPreviewToken: null,
    }))).json();
    expect(tampered).toEqual(clean);
    expect(tampered.items).toEqual([expectedPublicLine()]);
    expect(JSON.stringify(tampered)).not.toMatch(/tampered|stripe|provider|inventory|checkoutReady/iu);
  });

  it("composes public and exact guarded local rows without losing either", async () => {
    getPublicStorefrontView.mockResolvedValue(publicView("local"));
    getRequestIdentity.mockResolvedValue({ environment: localEnvironment, localDriver: { commerce: { cartPreviewSource } } });
    const response = await POST(request({ items: [
      { variantId: publicVariantId, quantity: 2 }, { variantId: syntheticVariantId, quantity: 2 },
    ] }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const preview: CartPreview = await response.json();
    expect(preview.items[0]).toEqual(expectedPublicLine("local_preview"));
    expect(preview.items[1]).toMatchObject({ variantId: syntheticVariantId, name: "Synthetic Reference Alpha — Demo Only",
      available: true, purchaseState: "ready", unitAmountMinor: 2_208, lineSubtotalMinor: 4_416 });
    expect(preview.subtotalMinor).toBe(12_814);
    expect(cartPreviewSource).toHaveBeenCalledExactlyOnceWith();
    expect(canContinueFromPreview(preview, preview.previewToken)).toBe(false);
  });

  it.each(["preview", "production"] as const)("does not call an injected local source in %s", async (mode) => {
    getPublicStorefrontView.mockResolvedValue(publicView(mode));
    getRequestIdentity.mockResolvedValue({ environment: { ...localEnvironment, APP_ENV: mode }, localDriver: { commerce: { cartPreviewSource } } });
    const preview: CartPreview = await (await POST(request({ items: [
      { variantId: publicVariantId, quantity: 2 }, { variantId: syntheticVariantId, quantity: 2 },
    ] }))).json();
    expect(preview.items[0]).toEqual(expectedPublicLine(mode === "production" ? "checkout_unavailable" : "local_preview"));
    expect(preview.items[1]).toMatchObject({ variantId: syntheticVariantId, name: null, available: false,
      purchaseState: "unknown_variant", unitAmountMinor: null });
    expect(cartPreviewSource).not.toHaveBeenCalled();
  });

  it.each(["same product", "different products"])("fails closed for duplicate public identities in %s", async (location) => {
    const products = location === "same product"
      ? [{ ...canonicalProduct, variants: [canonicalVariant, canonicalVariant] }]
      : [canonicalProduct, { ...canonicalProduct, id: "synthetic-other-product", variants: [canonicalVariant] }];
    getPublicStorefrontView.mockResolvedValue({ ...publicView(), catalog: { ...catalog, products } });
    await expectUnavailable(await POST(request()));
  });

  it("fails closed when public and synthetic sources collide", async () => {
    getRequestIdentity.mockResolvedValue({ environment: localEnvironment, localDriver: { commerce: { cartPreviewSource } } });
    cartPreviewSource.mockReturnValue({ variants: [{ ...syntheticVariant, variantId: publicVariantId }] });
    await expectUnavailable(await POST(request()));
  });

  it("sanitizes a typed projection failure", async () => {
    getPublicStorefrontView.mockResolvedValue({ ...publicView(), catalog: { ...catalog, products: [
      { ...canonicalProduct, variants: [{ ...canonicalVariant, packageQuantity: 0 }] },
    ] } });
    await expectUnavailable(await POST(request()));
  });

  it.each(["view rejection", "view synchronous throw", "identity rejection", "identity synchronous throw", "raw 42P01", "unrelated SQLSTATE"])(
    "returns one fixed unavailable response for %s", async (failure) => {
      const error = Object.assign(new Error("private test SQL/provider failure details"), {
        code: failure === "raw 42P01" ? "42P01" : "42501",
      });
      if (failure === "identity rejection") getRequestIdentity.mockRejectedValue(error);
      else if (failure === "identity synchronous throw") getRequestIdentity.mockImplementation(() => { throw error; });
      else if (failure === "view synchronous throw") getPublicStorefrontView.mockImplementation(() => { throw error; });
      else getPublicStorefrontView.mockRejectedValue(error);
      await expectUnavailable(await POST(request()));
      expect(getPublicStorefrontView).toHaveBeenCalledExactlyOnceWith();
      expect(getRequestIdentity).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it("sanitizes a guarded local source failure", async () => {
    getRequestIdentity.mockResolvedValue({ environment: localEnvironment, localDriver: { commerce: { cartPreviewSource } } });
    cartPreviewSource.mockImplementation(() => { throw new Error("private synthetic provider detail"); });
    await expectUnavailable(await POST(request()));
  });

  it("sanitizes a model failure", async () => {
    vi.spyOn(previewModel, "buildCartPreview").mockImplementation(() => { throw new Error("private model detail"); });
    await expectUnavailable(await POST(request()));
  });

  it("sanitizes a successful preview serialization failure", async () => {
    vi.spyOn(NextResponse, "json").mockImplementationOnce(() => { throw new Error("private serialization detail"); });
    await expectUnavailable(await POST(request()));
  });

  it("accepts the real accessor's reviewed missing-schema fallback", async () => {
    const environment = parseServerEnv({ APP_ENV: "local", BROWSE_CATALOG_PUBLICATION: browseCatalogPublicationId,
      DATABASE_MODE: "test", TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database" });
    const loadDatabaseRecords = vi.fn(async () => { throw Object.assign(new Error("private schema details"), { code: "42P01" }); });
    getPublicStorefrontView.mockImplementation(() => loadPublicStorefrontView(environment, {
      loadDatabaseRecords, nodeEnv: "test", now: () => new Date("2026-09-03T12:00:00.000Z"),
      reportCatalogDatabaseUnavailable: vi.fn(), controlledContent: [], verifiedImageMetadata: storefrontImageMetadata,
    }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const preview: CartPreview = await response.json();
    expect(preview.schemaVersion).toBe(2);
    expect(preview.items).toEqual([expectedPublicLine("local_preview")]);
    expect(loadDatabaseRecords).toHaveBeenCalledExactlyOnceWith(environment);
    expect(JSON.stringify(preview)).not.toMatch(/42P01|private|schema details/iu);
  });

  it.each([[undefined], [null], [""], ["a".repeat(63)], ["a".repeat(65)], ["A".repeat(64)], ["g".repeat(64)], [123], [{}], [[]]])(
    "normalizes invalid prior token %j to null", async (previousPreviewToken) => {
      const preview: CartPreview = await (await POST(request({ items: [{ variantId: publicVariantId, quantity: 2 }], previousPreviewToken }))).json();
      expect(preview.items).toEqual([expectedPublicLine()]);
      expect(preview.reasons).toEqual(["checkout_unavailable"]);
    },
  );

  it("uses valid prior tokens without granting public continuation", async () => {
    const initial: CartPreview = await (await POST(request())).json();
    const unchanged: CartPreview = await (await POST(request({ items: [{ variantId: publicVariantId, quantity: 2 }], previousPreviewToken: initial.previewToken }))).json();
    expect(unchanged.previewToken).toBe(initial.previewToken);
    expect(unchanged.reasons).toEqual(["checkout_unavailable"]);
    const changed: CartPreview = await (await POST(request({ items: [{ variantId: publicVariantId, quantity: 3 }], previousPreviewToken: initial.previewToken }))).json();
    expect(changed.previewToken).not.toBe(initial.previewToken);
    expect(changed.reasons).toEqual(["server_facts_changed", "checkout_unavailable"]);
    expect(canContinueFromPreview(changed, changed.previewToken)).toBe(false);
  });
});
