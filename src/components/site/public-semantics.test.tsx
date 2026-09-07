import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import {
  testCanonicalProduct,
  testPricingContext,
} from "@/components/commerce/storefront-test-fixtures";
import { PublicHome } from "@/components/site/public-home";
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
  it("uses the shared decorative science field without adding accessible noise", () => {
    const { container } = render(
      <CartProvider><PublicHome
        products={publicCatalog.products}
        variantCount={publicCatalog.displayConfigurationCount}
        pricing={pricing}
      /></CartProvider>,
    );

    expect(container.querySelector("[data-science-field='lattice']")).toBeNull();
    expect(container.querySelector("[data-motion-sequence='home-hero']")).not.toBeNull();
  });

  it("presents the owner-supplied catalog without inventing commerce facts", () => {
    render(
      <CartProvider><PublicHome
        products={publicCatalog.products}
        variantCount={publicCatalog.displayConfigurationCount}
        pricing={pricing}
      /></CartProvider>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Research materials,documented with clarity.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("For legitimate laboratory and research use only.")).toBeVisible();
    expect(screen.getByText("Not for human or veterinary use.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Browse catalog" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByRole("link", { name: "View cart" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(screen.getAllByText("56 products in the catalog").length).toBeGreaterThan(0);
    expect(screen.getByText("Trending products")).toBeVisible();
    expect(screen.getByText("Editorial selection")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/103 product configurations/iu);
    expect(
      screen.getByRole("heading", { level: 3, name: "Tirzepatide" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /view catalog item: tirzepatide/i }),
    ).toHaveAttribute("href", `/catalog/items/${publicCatalog.products[0]!.slug}`);
    expect(document.body).not.toHaveTextContent(/server-provided prices/i);
    expect(screen.queryByText(/apply|researcher approval/i)).toBeNull();
  });

  it("keeps the catalog path visible when no approved products are available", () => {
    render(<CartProvider><PublicHome products={[]} variantCount={0} pricing={pricing} /></CartProvider>);

    expect(screen.queryByText("00")).not.toBeInTheDocument();
    expect(screen.queryByText(/No products are available/iu)).not.toBeInTheDocument();
    expect(screen.getByText("Catalog highlights")).toBeVisible();
    expect(screen.getByRole("list", { name: "Catalog highlights" })).toBeEmptyDOMElement();
    expect(
      screen.getByRole("heading", { level: 2, name: "Explore the full research catalog." }),
    ).toBeVisible();
  });

  it("renders exactly one ordered four-node Proof Rail in the required order", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("list", { name: "Evidence relationship" });
    expect(rail).toHaveAttribute("data-motion-sequence", "proof-rail");
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
    for (const [index, item] of within(rail).getAllByRole("listitem").entries()) {
      expect(item).toHaveAttribute("data-motion-step", String(index + 1));
      expect(within(item).getByText("No approved public record")).toBeVisible();
    }
  });

  it("keeps conditional programs and editorial movements in the required module order", () => {
    render(
      <CartProvider><PublicHome
        loyaltyPolicy={activeLoyaltyPolicy}
        products={publicCatalog.products}
        variantCount={publicCatalog.displayConfigurationCount}
        pricing={pricing}
      /></CartProvider>,
    );

    expect(screen.getAllByRole("region", { name: "Active rewards program" })).toHaveLength(1);
    const highlights = screen.getByText("Catalog highlights");
    const programs = screen.getByRole("region", { name: "PROPEPTIQ programs" });
    const restriction = screen.getByRole("heading", {
      level: 2,
      name: "Research use only",
    });
    const closingAction = screen.getByRole("heading", {
      level: 2,
      name: "Explore the full research catalog.",
    });

    expect(highlights.compareDocumentPosition(programs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(programs.compareDocumentPosition(restriction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(restriction.compareDocumentPosition(closingAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    expect(
      screen.getAllByText(/Explore products from the PropeptIQ research catalog\./iu).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(
        /pricing and ordering are not available for these items/iu,
      ),
    ).toBeNull();
    expect(screen.queryByText(/owner-supplied|current snapshot/iu)).toBeNull();
  });
});
