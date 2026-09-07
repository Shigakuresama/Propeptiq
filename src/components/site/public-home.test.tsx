import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { parseStorefrontBindings } from "@/catalog/storefront-bindings";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

import {
  testCanonicalProduct,
  testPricingContext,
} from "@/components/commerce/storefront-test-fixtures";
import { PublicHome } from "./public-home";

const fictionalHomepage = Object.freeze({
  whyChoose: Object.freeze([
    Object.freeze({
      id: "fictional-value",
      title: "Fictional value",
      body: "Fictional value body.",
    }),
  ]),
  faqs: Object.freeze([
    Object.freeze({
      id: "fictional-question",
      question: "Fictional question?",
      answer: "Fictional answer.",
      anchor: "faq-fictional-question" as const,
    }),
  ]),
});

const browseCatalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: {
    products: [],
    bindings: parseStorefrontBindings({ products: [], variants: [] }),
  },
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});

describe("PublicHome approved content composition", () => {
  it("uses customer-facing catalog language while preserving canonical availability context", () => {
    render(
      <PublicHome
        products={[testCanonicalProduct([])]}
        variantCount={1}
        pricing={testPricingContext()}
      />,
    );

    const introduction = screen.getByText("Explore the research catalog. Compare amounts, see current pricing, and keep your selections together.");
    expect(introduction).toBeVisible();
    expect(introduction).toHaveClass(
      "text-lg",
      "leading-8",
    );
    expect(screen.getByText("1 products in the catalog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Find your next research material." })).toBeVisible();
    expect(screen.getByText("Explore products from the PropeptIQ research catalog.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/product configuration/iu);
    expect(document.body).not.toHaveTextContent(/owner-supplied|browse publication|current owner-supplied publication/iu);
  });

  it("keeps browse-only catalog language explicit without implying pricing or ordering", () => {
    render(<PublicHome products={browseCatalog.products} variantCount={browseCatalog.displayConfigurationCount} pricing={testPricingContext()} />);

    expect(screen.getAllByText(`${browseCatalog.products.length} products in the catalog`).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/product configurations/iu);
  });

  it("uses the dedicated unavailable message when the homepage catalog is empty", () => {
    render(<PublicHome products={[]} variantCount={0} pricing={testPricingContext()} />);

    expect(screen.queryByText(/No products are available/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explore 0 product configurations/u)).toBeNull();
  });

  it("places approved Why Choose and FAQ after catalog content and before the final quality callout", () => {
    render(
      <PublicHome
        homepageContent={fictionalHomepage}
        products={[]}
        variantCount={0}
        pricing={testPricingContext()}
      />,
    );

    const catalog = screen.getByText("Catalog highlights");
    const why = screen.getByRole("heading", { name: "Why choose PropeptIQ" });
    const faq = screen.getByRole("heading", { name: "Frequently Asked Questions" });
    const quality = screen.getByRole("heading", { name: "Research use only" });

    expect(catalog.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(why.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(faq.compareDocumentPosition(quality) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Newsletter signup" })).toBeNull();
  });

  it("uses a frozen empty default and emits neither section when production content is empty", () => {
    render(
      <PublicHome products={[]} variantCount={0} pricing={testPricingContext()} />,
    );

    expect(screen.queryByRole("heading", { name: "Why choose PropeptIQ" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Frequently Asked Questions" })).toBeNull();
    expect(document.getElementById("why-choose-propeptiq")).toBeNull();
    expect(document.getElementById("faq")).toBeNull();
    expect(screen.getByRole("heading", { name: "Research use only" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "PropeptIQ newsletter" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Newsletter signup" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
    expect(document.querySelector('a[href="/privacy-policy"]')).toBeNull();
  });
});
