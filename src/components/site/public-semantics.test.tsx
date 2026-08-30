import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "@/catalog/browse-catalog";
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

describe("public storefront semantics", () => {
  it("uses the shared decorative science field without adding accessible noise", () => {
    const { container } = render(
      <PublicHome products={browseCatalogProducts} variantCount={103} />,
    );

    const field = container.querySelector("[data-science-field='lattice']");
    expect(field).toHaveAttribute("aria-hidden", "true");
    expect(field?.querySelector("svg")).toHaveAttribute("focusable", "false");
    expect(container.querySelector("[data-motion-sequence='home-hero']")).not.toBeNull();
  });

  it("presents the owner-supplied catalog without inventing commerce facts", () => {
    render(<PublicHome products={browseCatalogProducts} variantCount={103} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Research materials, documented with greater clarity.",
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
      screen.getByRole("link", { name: /open catalog dossier: tirzepatide/i }),
    ).toHaveAttribute("href", `/catalog/items/${browseCatalogProducts[0]!.slug}`);
    expect(document.body).not.toHaveTextContent(/server-provided prices/i);
    expect(screen.queryByText(/apply|researcher approval/i)).toBeNull();
  });

  it("omits the highlights movement when no approved products are available", () => {
    render(<PublicHome products={[]} variantCount={0} />);

    expect(screen.getByText("00")).toBeVisible();
    expect(screen.getByText(/Product families spanning 0 supplied package configurations/iu)).toBeVisible();
    expect(screen.queryByText("Catalog highlights")).toBeNull();
    expect(screen.queryByRole("list", { name: "Catalog highlights" })).toBeNull();
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
      <PublicHome
        loyaltyPolicy={activeLoyaltyPolicy}
        products={browseCatalogProducts}
        variantCount={103}
      />,
    );

    expect(screen.getAllByRole("region", { name: "Active rewards program" })).toHaveLength(1);
    const rail = screen.getByRole("list", { name: "Evidence relationship" });
    const highlights = screen.getByText("Catalog highlights");
    const programs = screen.getByRole("heading", {
      level: 2,
      name: "Programs appear only from active policy records.",
    });
    const documentation = screen.getByRole("heading", {
      level: 2,
      name: "Follow the record, not an unsupported claim.",
    });
    const restriction = screen.getByRole("heading", {
      level: 2,
      name: "A clear boundary, integrated into the catalog.",
    });
    const closingAction = screen.getByRole("heading", {
      level: 2,
      name: "Explore the full research catalog.",
    });

    expect(rail.compareDocumentPosition(highlights) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(highlights.compareDocumentPosition(programs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(programs.compareDocumentPosition(documentation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(documentation.compareDocumentPosition(restriction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(restriction.compareDocumentPosition(closingAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
