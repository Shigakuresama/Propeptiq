import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { testPricingContext } from "@/components/commerce/storefront-test-fixtures";
import { projectApprovedNewsletterPrivacyHref } from "@/lib/site-content";

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

const fictionalPrivacyHref = projectApprovedNewsletterPrivacyHref(
  "/test-only-fictional-privacy",
  Object.freeze(["/test-only-fictional-privacy"]),
)!;

describe("PublicHome approved content composition", () => {
  it("places approved Why Choose, FAQ, and newsletter after catalog content and before the final quality callout", () => {
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
    const newsletter = screen.getByRole("heading", { name: "PropeptIQ newsletter" });
    const quality = screen.getByRole("heading", {
      name: "Follow the record, not an unsupported claim.",
    });

    expect(catalog.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(why.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(faq.compareDocumentPosition(newsletter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newsletter.compareDocumentPosition(quality) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "PropeptIQ newsletter" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Newsletter signup is temporarily unavailable.",
    );
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
    expect(document.querySelector('a[href="/privacy-policy"]')).toBeNull();
  });

  it("renders one configured newsletter section with only the exact approved privacy link", () => {
    render(
      <PublicHome
        newsletterPrivacyHref={fictionalPrivacyHref}
        products={[]}
        variantCount={0}
        pricing={testPricingContext()}
      />,
    );

    expect(screen.getAllByRole("heading", { name: "PropeptIQ newsletter" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      fictionalPrivacyHref.href,
    );
    expect(screen.queryByText(/provider configured/iu)).toBeNull();
  });
});
