import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicStorefrontContent } from "@/catalog/storefront-public";

import { ProductInformationSections } from "./product-information-sections";

function record(
  overrides: Partial<PublicStorefrontContent> = {},
): PublicStorefrontContent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "product_information",
    status: "approved",
    title: "Catalog overview",
    body: "Neutral, approved catalog information.",
    literatureReferences: [],
    ...overrides,
  };
}

describe("ProductInformationSections", () => {
  it("renders an approved overview and a clearly separated PubMed discovery link", () => {
    render(
      <ProductInformationSections
        records={[
          record(),
          record({
            id: "22222222-2222-4222-8222-222222222222",
            title: "Literature discovery",
            body: "Use the external search to review indexed literature independently.",
            literatureReferences: [{
              href: "https://pubmed.ncbi.nlm.nih.gov/?term=BPC-157",
              term: "BPC-157",
            }],
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Product information" }),
    ).toBeVisible();
    expect(screen.getByText("Neutral, approved catalog information.")).toBeVisible();
    const link = screen.getByRole("link", {
      name: "Search PubMed for BPC-157",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://pubmed.ncbi.nlm.nih.gov/?term=BPC-157",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      within(link).getByText("External literature search"),
    ).toBeVisible();
  });

  it.each([
    "secret",
    "http://pubmed.ncbi.nlm.nih.gov/?term=unsafe",
    "https://pubmed.ncbi.nlm.nih.gov.evil.example/?term=unsafe",
    "https://pubmed.ncbi.nlm.nih.gov/?term=alpha&redirect=https://evil.example",
    "https://pubmed.ncbi.nlm.nih.gov/12345/",
  ])("does not expose an unapproved source reference: %s", (sourceReference) => {
    render(
      <ProductInformationSections
        records={[record({
          literatureReferences: [{ href: sourceReference, term: "unsafe" }],
        })]}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body).not.toHaveTextContent(sourceReference);
  });

  it("omits drafts, unrelated content kinds, and empty content", () => {
    const records = [
      record({ kind: "faq" }),
    ];
    const { container, rerender } = render(
      <ProductInformationSections records={records} />,
    );
    expect(
      screen.queryByRole("heading", { name: "Product information" }),
    ).toBeNull();

    rerender(<ProductInformationSections records={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
