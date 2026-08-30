import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/cart/cart-provider";

const { getPublicCatalogMock, getPublicGrowthProjectionMock } = vi.hoisted(() => ({
  getPublicCatalogMock: vi.fn(),
  getPublicGrowthProjectionMock: vi.fn(),
}));

vi.mock("@/catalog/server", () => ({ getPublicCatalog: getPublicCatalogMock }));
vi.mock("@/growth/public-growth-server", () => ({
  getPublicGrowthProjection: getPublicGrowthProjectionMock,
}));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
  ProductTitleTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import ProductPage from "./page";

const product = {
  id: "product-1",
  slug: "reference-record",
  name: "Reference record",
  packageForm: "sealed unit",
  price: { id: "price-1", amountMinor: 5_621, currency: "USD", version: 1 },
  availableQuantity: 4,
  claims: [],
  merchandising: [],
  relatedProducts: [],
  proof: [
    { label: "Material identity", state: "Recorded identity" },
    { label: "Analytical method", state: "No approved public record" },
    { label: "Lot/batch", state: "LOT-1" },
    { label: "COA state", state: "No approved public record" },
  ],
} as const;

describe("database-backed product page rewards", () => {
  it("shows points only from the active server loyalty projection", async () => {
    getPublicCatalogMock.mockResolvedValue({
      source: "production",
      products: [product],
      promotions: [],
      qualityRecords: [],
    });
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: {
          id: "loyalty-1",
          version: 1,
          status: "active",
          pointsPerDollar: 2,
          redemptionMinorPerPoint: 1,
          minimumRedemptionPoints: 500,
          maximumRedemptionBasisPoints: 2_500,
          expiresAfterDays: null,
          effectiveAt: "2026-08-27T00:00:00.000Z",
          supersededAt: null,
        },
        referral: null,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });

    render(
      <CartProvider>
        {await ProductPage({ params: Promise.resolve({ slug: product.slug }) })}
      </CartProvider>,
    );

    expect(screen.getByText("Earn 112 points")).toBeVisible();
    const intro = screen.getByRole("heading", { level: 1, name: product.name }).closest("header");
    expect(intro).toHaveAttribute("data-motion-sequence", "dossier-intro");
    expect(intro?.querySelectorAll("[data-motion-step]")).toHaveLength(3);
    expect(
      screen.getByText(
        "No linked analytical statements are available for public display on this record. No pending evidence state is inferred.",
      ),
    ).toBeVisible();
  });

  it.each(["inactive", "read_error"] as const)(
    "does not show points when the policy read is %s",
    async (status) => {
      getPublicCatalogMock.mockResolvedValue({
        source: "production",
        products: [product],
        promotions: [],
        qualityRecords: [],
      });
      getPublicGrowthProjectionMock.mockResolvedValue({ status });

      render(
        <CartProvider>
          {await ProductPage({ params: Promise.resolve({ slug: product.slug }) })}
        </CartProvider>,
      );
      expect(screen.queryByText(/Earn \d+ points/)).toBeNull();
    },
  );
});
