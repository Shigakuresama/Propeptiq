import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentity, cartPreviewSource } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  cartPreviewSource: vi.fn(() => ({
    variants: [{
      variantId: "55000000-0000-4000-8000-000000000001",
      productId: "61000000-0000-4000-8000-000000000001",
      name: "Synthetic Reference Alpha — Demo Only",
      packageForm: "Synthetic sealed reference unit",
      variantLabel: "Synthetic 5 mg fixture",
      sku: "SYNTHETIC-ALPHA-5MG",
      baseUnitMinor: 2_400,
      currency: "USD",
      priceStatus: "active",
      availability: "available",
      availableQuantity: 12,
      checkoutReady: true,
      eligiblePromotions: [],
    }],
  })),
}));

vi.mock("@/auth/server", () => ({ getRequestIdentity }));

import { POST } from "./route";

const localEnvironment = {
  APP_ENV: "local",
  APP_ORIGIN: "http://127.0.0.1:4631",
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "enabled",
  LOCAL_TEST_SECRET: "catalog-preview-local-secret-at-least-32-characters",
  RATE_LIMIT_SECRET: "catalog-preview-rate-secret-at-least-32-characters",
  VERCEL_ENV: "development",
  VERCEL_TARGET_ENV: "development",
  AUTH_MODE: "disabled",
  DATABASE_MODE: "disabled",
  PAYMENTS_MODE: "disabled",
  STORAGE_MODE: "disabled",
  EMAIL_MODE: "disabled",
  TAX_MODE: "test",
  SHIPPING_MODE: "test",
  FULFILLMENT_MODE: "test",
  COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
};

function request() {
  return new Request("http://127.0.0.1:4631/api/catalog/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: [{
        variantId: "55000000-0000-4000-8000-000000000001",
        quantity: 2,
      }],
      previousPreviewToken: null,
    }),
  });
}

describe("POST /api/catalog/preview local/test canonical source guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the driver source only under the exact local-commerce guard", async () => {
    getRequestIdentity.mockResolvedValue({
      environment: localEnvironment,
      localDriver: { commerce: { cartPreviewSource } },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: 2,
      items: [{
        variantId: "55000000-0000-4000-8000-000000000001",
        available: true,
        purchaseState: "ready",
        unitAmountMinor: 2_208,
        lineSubtotalMinor: 4_416,
      }],
    });
    expect(cartPreviewSource).toHaveBeenCalledTimes(1);
  });

  it("keeps Preview empty even if a local driver object is injected", async () => {
    getRequestIdentity.mockResolvedValue({
      environment: { ...localEnvironment, APP_ENV: "preview" },
      localDriver: { commerce: { cartPreviewSource } },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{
        variantId: "55000000-0000-4000-8000-000000000001",
        available: false,
        unitAmountMinor: null,
      }],
    });
    expect(cartPreviewSource).not.toHaveBeenCalled();
  });
});
