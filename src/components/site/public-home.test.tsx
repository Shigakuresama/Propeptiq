import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

describe("PublicHome approved content composition", () => {
  it("uses customer-facing catalog language while preserving canonical availability context", () => {
    render(
      <PublicHome
        products={[testCanonicalProduct([])]}
        variantCount={1}
        pricing={testPricingContext()}
      />,
    );

    expect(screen.getByText("Explore research materials, compare product configurations, and find the details you need in one place.")).toBeVisible();
    expect(screen.getByText("Explore the collection")).toBeVisible();
    expect(screen.getByText("Explore 1 product configurations. Select a product to see its details, pricing, and availability.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Find your next research material." })).toBeVisible();
    expect(screen.getByText("Explore products from the PropeptIQ research catalog.")).toBeVisible();
    expect(screen.getByText("Product configuration")).toBeVisible();
    expect(screen.getByText("Review each product's details and the Research-Use Policy before making your selection.")).toBeVisible();
    expect(screen.getByText("Explore every product and configuration in our research catalog.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/owner-supplied|browse publication|current owner-supplied publication/iu);
  });

  it("keeps browse-only catalog language explicit without implying pricing or ordering", () => {
    render(<PublicHome products={[]} variantCount={0} pricing={testPricingContext()} />);

    expect(screen.getByText("Explore 0 product configurations. Select a product to see its listed details. Pricing and ordering are not available for these items.")).toBeVisible();
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
    const quality = screen.getByRole("heading", {
      name: "Follow the record, not an unsupported claim.",
    });

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
    expect(screen.getByRole("heading", {
      name: "Follow the record, not an unsupported claim.",
    })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "PropeptIQ newsletter" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Newsletter signup" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
    expect(document.querySelector('a[href="/privacy-policy"]')).toBeNull();
  });
});
