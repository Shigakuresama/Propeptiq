import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import { PublicHome } from "@/components/site/public-home";
import { CartProvider } from "@/cart/cart-provider";
import {
  testCanonicalProduct,
  testPricingContext,
} from "@/components/commerce/storefront-test-fixtures";
import type { LoyaltyPolicy } from "@/domain/rewards";

import { ProofRail } from "./proof-rail";

const activeLoyaltyPolicy: LoyaltyPolicy = {
  id: "loyalty-active",
  version: 1,
  status: "active",
  pointsPerDollar: 2,
  redemptionMinorPerPoint: 1,
  minimumRedemptionPoints: 500,
  maximumRedemptionBasisPoints: 2_500,
  expiresAfterDays: null,
  effectiveAt: "2026-08-27T00:00:00.000Z",
  supersededAt: null,
};

const publicCatalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});
const pricing = testPricingContext("test");

describe("public storefront semantics", () => {
  it("presents the owner-supplied catalog without inventing commerce facts", () => {
    render(
      <PublicHome
        products={publicCatalog.products}
        variantCount={publicCatalog.displayConfigurationCount}
        pricing={pricing}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Research materials, documented for laboratory work.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("For legitimate laboratory and research use only."),
    ).toBeVisible();
    expect(screen.getByText("Not for human or veterinary use.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Browse catalog" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByRole("link", { name: "View cart" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(screen.getByText("56")).toBeVisible();
    const catalogExplanation = screen.getByText(/Product families spanning 103 supplied package configurations/iu);
    expect(catalogExplanation).toHaveClass("text-base");
    expect(catalogExplanation).not.toHaveClass("text-sm");
    expect(screen.getByText("Tirzepatide")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /view catalog item: tirzepatide/i }),
    ).toHaveAttribute("href", `/catalog/items/${publicCatalog.products[0]!.slug}`);
    expect(document.body).not.toHaveTextContent(/server-provided prices/i);
    expect(screen.queryByText(/apply|researcher approval/i)).toBeNull();
  });

  it("renders exactly one ordered four-node Proof Rail in the required order", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("list", { name: "Evidence relationship" });
    const stages = within(rail)
      .getAllByRole("listitem")
      .map((item) => within(item).getByRole("heading", { level: 3 }).textContent);

    expect(stages).toEqual([
      "Material identity",
      "Analytical method",
      "Lot/batch",
      "COA state",
    ]);
    expect(screen.getAllByRole("list", { name: "Evidence relationship" })).toHaveLength(1);
    expect(within(rail).getAllByRole("listitem")).toHaveLength(4);
    for (const item of within(rail).getAllByRole("listitem")) {
      expect(within(item).getByText("No approved public record")).toBeVisible();
    }
  });

  it("keeps one active program strip and the Proof Rail ahead of catalog highlights", () => {
    render(
      <PublicHome
        loyaltyPolicy={activeLoyaltyPolicy}
        products={publicCatalog.products}
        variantCount={publicCatalog.displayConfigurationCount}
        pricing={pricing}
      />,
    );

    expect(screen.getAllByRole("region", { name: "Active rewards program" })).toHaveLength(1);
    const rail = screen.getByRole("list", { name: "Evidence relationship" });
    const highlights = screen.getByText("Catalog highlights");
    expect(rail.compareDocumentPosition(highlights) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses neutral catalog snapshot copy when canonical commerce rows exist", () => {
    render(
      <CartProvider>
        <PublicHome
          products={[testCanonicalProduct()]}
          variantCount={1}
          pricing={pricing}
        />
      </CartProvider>,
    );

    expect(screen.getAllByText(/current price and availability snapshots are displayed where configured and revalidated before checkout/iu).length).toBeGreaterThan(0);
    expect(screen.queryByText(/purchasing and operational availability remain separate from this browse-only collection/iu)).toBeNull();
    expect(screen.queryByText(/prices are intentionally excluded/iu)).toBeNull();
  });
});
