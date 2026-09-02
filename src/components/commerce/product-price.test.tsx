import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { PublicStorefrontVariant } from "@/catalog/storefront-public";

import { ProductPrice } from "./product-price";

const winter30 = {
  id: "winter30", displayName: "Winter Sale", displayCode: "WINTER30", discountBps: 3_000,
  enabled: true as const, startAt: null, endAt: null, timezone: "America/Los_Angeles",
  scope: { kind: "sitewide" as const }, applicationMode: "automatic" as const,
};

function pricing(mode: PublicStorefrontPricingContext["mode"], promoted = true): PublicStorefrontPricingContext {
  return { mode, evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: promoted ? [winter30] : [] };
}

function variant(overrides: Partial<PublicStorefrontVariant> = {}): PublicStorefrontVariant {
  return {
    id: "variant-5mg", sku: "TEST-5MG", label: "5 mg", amount: { value: 5, unit: "mg" },
    packageQuantity: 1, availability: "available", priceStatus: "active", baseUnitMinor: 1_000,
    currency: "USD", checkoutReady: true, ...overrides,
  };
}

describe("ProductPrice", () => {
  it("uses semantic standard/current price markup with accessible discount and savings", () => {
    render(<ProductPrice productId="product-alpha" variant={variant()} pricing={pricing("production")} />);
    expect(screen.getByText("$10.00").tagName).toBe("DEL");
    expect(screen.getByText("$7.00").tagName).toBe("STRONG");
    expect(screen.getByText("-30%")).toBeVisible();
    expect(screen.getByText("Save $3.00")).toBeVisible();
  });

  it("renders an undiscounted price once without deletion or a badge", () => {
    const { container } = render(<ProductPrice productId="product-alpha" variant={variant()} pricing={pricing("production", false)} />);
    expect(screen.getAllByText("$10.00")).toHaveLength(1);
    expect(container.querySelector("del")).toBeNull();
    expect(screen.queryByText(/%/u)).toBeNull();
    expect(screen.queryByText(/save/iu)).toBeNull();
  });

  it("labels a truthful mapping-missing active price as checkout unavailable", () => {
    render(<ProductPrice productId="product-alpha" variant={variant({ checkoutReady: false })} pricing={pricing("production")} />);
    expect(screen.getByText("$7.00")).toBeVisible();
    expect(screen.getByText("Checkout unavailable")).toBeVisible();
  });

  it("shows the explicit zero-dollar preview sale only outside production", () => {
    const pendingZero = variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false });
    const { rerender } = render(<ProductPrice productId="product-alpha" variant={pendingZero} pricing={pricing("preview")} />);
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.getByText("-30%")).toBeVisible();
    expect(screen.getByText("Local cart preview")).toBeVisible();

    rerender(<ProductPrice productId="product-alpha" variant={pendingZero} pricing={pricing("production")} />);
    expect(screen.getByText("Pricing coming soon")).toBeVisible();
    expect(screen.queryByText("-30%")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it.each([
    ["unavailable", variant({ availability: "unavailable", checkoutReady: false }), "Unavailable"],
    ["pending positive", variant({ priceStatus: "pending", availability: "preview_only", checkoutReady: false }), "Pricing coming soon"],
    ["pending null", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }), "Pricing coming soon"],
    ["active zero", variant({ baseUnitMinor: 0, checkoutReady: false }), "Pricing coming soon"],
  ] as const)("renders honest status for %s", (_label, input, copy) => {
    const { unmount } = render(<ProductPrice productId="product-alpha" variant={input} pricing={pricing("preview")} />);
    expect(screen.getByText(copy)).toBeVisible();
    expect(screen.queryByText(/save/iu)).toBeNull();
    unmount();
  });
});
