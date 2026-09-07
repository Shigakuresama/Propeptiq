import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { parseStorefrontBindings } from "@/catalog/storefront-bindings";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  findPublicStorefrontProduct,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

import { CatalogItemDetail } from "./catalog-item-detail";
import {
  testCanonicalProduct,
  testPricingContext,
  testPublicVariant,
  testWinter30,
} from "./storefront-test-fixtures";

const calculator = Object.freeze({
  title: "Synthetic approved calculator",
  body: "Synthetic approved body.",
  limits: Object.freeze({ maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 10 }),
});

const { capturedPricing } = vi.hoisted(() => ({ capturedPricing: [] as unknown[] }));
vi.mock("./product-purchase-panel", () => ({
  ProductPurchasePanel: ({
    onSelectedQuantityChange,
    onSelectedVariantIdChange,
    pricing,
    product,
  }: {
    onSelectedQuantityChange?: (quantity: number | null) => void;
    onSelectedVariantIdChange?: (variantId: string) => void;
    pricing: unknown;
    product: { variants: readonly { id: string; label: string }[] };
  }) => {
    capturedPricing.push(pricing);
    return (
      <section aria-labelledby="purchase-heading">
        <h2 id="purchase-heading">Purchase</h2>
        <div data-testid="purchase-panel" />
        {product.variants.map((variant) => (
          <button
            aria-label={`Select visual variant ${variant.label}`}
            key={variant.id}
            onClick={() => onSelectedVariantIdChange?.(variant.id)}
            type="button"
          >
            {variant.label}
          </button>
        ))}
        {[2, 3, 4, 10, 11].map((quantity) => (
          <button
            aria-label={`Select visual quantity ${quantity}`}
            key={quantity}
            onClick={() => onSelectedQuantityChange?.(quantity)}
            type="button"
          >
            {quantity}
          </button>
        ))}
        <button
          aria-label="Invalidate visual quantity"
          onClick={() => onSelectedQuantityChange?.(null)}
          type="button"
        >
          Invalid quantity
        </button>
      </section>
    );
  },
}));
const { capturedRelated } = vi.hoisted(() => ({ capturedRelated: [] as Array<{ products: unknown; pricing: unknown }> }));
vi.mock("./related-products-carousel", () => ({ RelatedProductsCarousel: (props: { products: unknown; pricing: unknown }) => { capturedRelated.push(props); return <section aria-label="Related Products"><h2>Related Products</h2><ul>{(props.products as Array<{ name: string }>).map((product) => <li key={product.name}>{product.name}</li>)}</ul></section>; } }));

describe("CatalogItemDetail", () => {
  const catalog = buildPublicStorefrontCatalog({
    configuredPublicationId: browseCatalogPublicationId,
    catalogData: storefrontCatalogData,
    runtimeVariantFacts: [],
    controlledContent: [],
    verifiedImageMetadata: storefrontImageMetadata,
  });

  it("shows selectable amounts and sourced compound information without duplicate specifications", () => {
    const product = findPublicStorefrontProduct(catalog, "pinealon")!;
    expect(product.kind).toBe("canonical");
    if (product.kind !== "canonical") throw new Error("Expected canonical fixture");
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} relatedProducts={[]} calculator={null} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Pinealon" });
    const intro = heading.closest("header");
    expect(heading).toBeVisible();
    expect(intro).toHaveClass("min-w-0");
    expect(heading).toHaveClass("[overflow-wrap:anywhere]");
    expect(intro).toHaveAttribute("data-motion-sequence", "dossier-intro");
    const motionSteps = Array.from(intro?.querySelectorAll("[data-motion-step]") ?? []);
    const expectedMotionStepCount = 3 + (product.description ? 1 : 0);
    expect(motionSteps).toHaveLength(expectedMotionStepCount);
    expect(motionSteps.map((step) => step.getAttribute("data-motion-step"))).toEqual(
      Array.from({ length: expectedMotionStepCount }, (_, index) => String(index + 1)),
    );
    if (product.description) expect(screen.getByText(product.description)).toBeVisible();
    const image = screen.getByRole("img", {
      name: "Front view of Pinealon",
    });
    const information = screen.getByRole("heading", { name: "Compound information" });
    expect(screen.queryByText("Product specifications")).toBeNull();
    expect(image).toBeVisible();
    expect(
      heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      image.compareDocumentPosition(information) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(image.closest(".catalog-detail-image")).toHaveClass(
      "mt-4",
      "lg:col-start-1",
      "lg:row-start-1",
      "lg:row-span-2",
      "lg:mt-0",
    );
    expect(screen.getByTestId("purchase-panel").closest(".catalog-detail-content")).toHaveClass("min-w-0", "lg:col-start-2", "lg:row-start-2");
    expect(screen.getByText("Also listed as Pinealon10mg")).toBeVisible();
    expect(screen.getByText("Product details")).toBeVisible();
    expect(screen.getByRole("button", { name: "Select visual variant 5mg" })).toBeVisible();
    expect(screen.getByText("Catalog identity").nextElementSibling).toHaveTextContent(product.sourceName);
    expect(screen.queryByText("5mg × 10 vials")).not.toBeInTheDocument();
    expect(screen.queryByText("AI-generated catalog illustration — not actual product photography.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to cart/i })).toBeNull();
    expect(document.body).not.toHaveTextContent(/\$|usd/i);
  });

  it("puts canonical purchase before approved information without duplicate specifications", () => {
    const product = testCanonicalProduct([], {
      content: [{
        id: "approved-info",
        kind: "product_information",
        status: "approved",
        title: "Approved product information",
        body: "Approved product body.",
        literatureReferences: [],
      }],
    });
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} relatedProducts={[]} calculator={null} />);

    const purchase = screen.getByRole("heading", { name: "Purchase" });
    expect(screen.queryByText("Product specifications")).toBeNull();
    const information = screen.getByRole("heading", { name: "Approved product information" });
    expect(purchase.compareDocumentPosition(information) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("replaces only untouched generic records while preserving substantive and edited known-product information", () => {
    const common = { kind: "product_information" as const, status: "approved" as const, literatureReferences: [] };
    const product = testCanonicalProduct([], { slug: "pinealon", name: "Pinealon", content: [
      { ...common, id: "generic-details", title: "Product details", body: "Compare the listed amounts for Pinealon. Select an amount to view its price and availability." },
      { ...common, id: "generic-discovery", title: "PubMed literature discovery", body: "Search PubMed for literature about Pinealon. Search results are provided for literature discovery only. They are not a curated study list, endorsement, product claim, or use guidance." },
      { ...common, id: "substantive", title: "Approved reference note", body: "Separate approved product information." },
      { ...common, id: "edited-generated-record", title: "Product details", body: "Owner-edited approved details." },
      { ...common, kind: "legal_notice", id: "legal", title: "Approved notice", body: "Separate approved legal notice." },
    ] });
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} relatedProducts={[]} calculator={null} />);
    expect(screen.getByRole("heading", { name: "Compound information" })).toBeVisible();
    expect(screen.queryByText(/Compare the listed amounts for Pinealon/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "PubMed literature discovery" })).toBeNull();
    expect(screen.getByText("Separate approved product information.")).toBeVisible();
    expect(screen.getByText("Owner-edited approved details.")).toBeVisible();
    expect(screen.getByText("Separate approved legal notice.")).toBeVisible();
  });

  it("keeps the price beneath the name accurate as bundle quantity changes", () => {
    render(<CatalogItemDetail calculator={null} product={testCanonicalProduct()} pricing={testPricingContext("production", [testWinter30])} relatedProducts={[]} />);
    const heading = screen.getByRole("heading", { level: 1 });
    const unitPrice = document.querySelector(".catalog-detail-price")!;
    expect(heading.nextElementSibling).toBe(unitPrice);
    expect(unitPrice.querySelector("strong")).toHaveTextContent("$7.00");
    expect(unitPrice).toHaveTextContent("Save $3.00 per unit");
    fireEvent.click(screen.getByRole("button", { name: "Select visual quantity 4" }));
    expect(unitPrice.querySelector("strong")).toHaveTextContent("$6.58");
    expect(unitPrice).toHaveTextContent("Save $3.42 per unit");
    fireEvent.click(screen.getByRole("button", { name: "Invalidate visual quantity" }));
    expect(document.querySelector(".catalog-detail-price")).toBeNull();
  });

  it("keeps the hero variant label and sale badge synchronized with purchase selection", () => {
    const priced = testPublicVariant({
      id: "priced-variant",
      label: "Priced 10 mg",
      baseUnitMinor: 10_00,
    });
    const pending = testPublicVariant({
      id: "pending-variant",
      label: "Pending 20 mg",
      availability: "preview_only",
      baseUnitMinor: 0,
      checkoutReady: false,
      priceStatus: "pending",
    });
    const unavailable = testPublicVariant({
      id: "unavailable-variant",
      label: "Unavailable 30 mg",
      availability: "unavailable",
      checkoutReady: false,
    });
    const product = testCanonicalProduct([priced, pending, unavailable], {
      defaultVariantId: priced.id,
    });
    const { container } = render(
      <CatalogItemDetail
        calculator={null}
        pricing={testPricingContext("local", [testWinter30])}
        product={product}
        relatedProducts={[]}
      />,
    );
    const visual = container.querySelector<HTMLElement>(".catalog-product-visual")!;
    const visualVariant = () => visual.querySelector<HTMLElement>(".catalog-product-visual__variant");

    expect(visualVariant()).toHaveTextContent("Priced 10 mg");
    expect(within(visual).getByLabelText("-30%")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Select visual variant Pending 20 mg" }));
    expect(visualVariant()).toHaveTextContent("Pending 20 mg");
    expect(within(visual).queryByLabelText("-30%")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select visual variant Unavailable 30 mg" }));
    expect(visualVariant()).toHaveTextContent("Unavailable 30 mg");
    expect(within(visual).queryByLabelText("-30%")).toBeNull();
  });

  it("keeps the hero discount badge synchronized with quantity tiers", () => {
    const product = testCanonicalProduct([testPublicVariant({ baseUnitMinor: 10_00 })]);
    const { container } = render(
      <CatalogItemDetail
        calculator={null}
        pricing={testPricingContext("production")}
        product={product}
        relatedProducts={[]}
      />,
    );
    const visual = container.querySelector<HTMLElement>(".catalog-product-visual")!;

    expect(within(visual).queryByLabelText(/^-\d+%$/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select visual quantity 2" }));
    expect(within(visual).getByLabelText("-3%")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Select visual quantity 3" }));
    expect(within(visual).getByLabelText("-3%")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Select visual quantity 4" }));
    expect(within(visual).getByLabelText("-6%")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Select visual quantity 11" }));
    expect(within(visual).getByLabelText("-30%")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Invalidate visual quantity" }));
    expect(within(visual).queryByLabelText(/^-\d+%$/u)).toBeNull();
  });

  it("keeps browse-only compound information with its ordering notice and no purchase controls", () => {
    const browseOnlyCatalog = buildPublicStorefrontCatalog({
      configuredPublicationId: browseCatalogPublicationId,
      catalogData: { products: [], bindings: parseStorefrontBindings({ products: [], variants: [] }) },
      runtimeVariantFacts: [],
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
    });
    const product = findPublicStorefrontProduct(browseOnlyCatalog, "pinealon")!;
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} relatedProducts={[]} calculator={null} />);

    const information = screen.getByRole("heading", { name: "Compound information" });
    expect(screen.queryByText("Product specifications")).toBeNull();
    const notice = screen.getByText("Product details are shown above. Pricing and ordering are not available for this item.");
    expect(notice.compareDocumentPosition(information) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Purchase" })).toBeNull();
  });

  it.each([
    ["bpc-tb-blend", "BB10", "BPC 5mg + TB 5mg"],
    ["bpc-tb-blend-bb20", "BB20", "BPC 10mg + TB 10mg"],
    ["bpc-tb-blend-bb40", "BB40", "BPC 20mg + TB 20mg"],
    ["cjc-1295-no-dac-ipa", "CP10", "CJC-1295 NO DAC 5mg + IPA 5mg"],
    ["cjc-1295-no-dac-ipa-cp20", "CP20", "CJC-1295 NO DAC 10mg + IPA 10mg"],
  ])("keeps the exact supplied blend composition attached to %s", (slug, code, sourceName) => {
    const product = findPublicStorefrontProduct(catalog, slug)!;
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} relatedProducts={[]} calculator={null} />);

    expect(product.displayConfigurations.some((configuration) => configuration.displayCode === code)).toBe(true);
    expect(screen.getByText("Catalog identity").nextElementSibling).toHaveTextContent(sourceName);
    expect(screen.queryByText("Product specifications")).toBeNull();
  });

  it("renders only approved allowed content literally and forwards exact pricing", () => {
    const pricing = testPricingContext(); capturedPricing.length = 0;
    const content = [
      { id: "info", kind: "product_information" as const, status: "approved" as const, title: "Approved info", body: "literal <em>text</em>", literatureReferences: [{ href: "secret", term: "secret" }], approvalNote: "private", reviewedAt: "2026", effectiveAt: "2026" },
      { id: "draft", kind: "legal_notice" as const, status: "draft" as const, title: "Draft", body: "DRAFT", literatureReferences: [], approvalNote: null, reviewedAt: null, effectiveAt: null },
      { id: "faq", kind: "faq" as const, status: "approved" as const, title: "FAQ", body: "FAQ", literatureReferences: [], approvalNote: null, reviewedAt: null, effectiveAt: null },
      { id: "legal", kind: "legal_notice" as const, status: "approved" as const, title: "Legal", body: "Approved legal", literatureReferences: [], approvalNote: null, reviewedAt: null, effectiveAt: null },
    ];
    const product = testCanonicalProduct([], {
      content: content as never,
      description: "Approved overview text.",
    });
    render(<CatalogItemDetail product={product} pricing={pricing} relatedProducts={[]} calculator={null} />);
    expect(screen.getByTestId("purchase-panel")).toBeVisible(); expect(capturedPricing[0]).toBe(pricing); expect(screen.getByText("Approved overview text.")).toBeVisible(); expect(screen.getByText("literal <em>text</em>")).toBeVisible(); expect(screen.getByText("Approved legal")).toBeVisible();
    expect(screen.queryByText("DRAFT")).toBeNull(); expect(screen.queryByText("FAQ")).toBeNull(); expect(screen.queryByText("private")).toBeNull(); expect(screen.queryByText("secret")).toBeNull(); expect(screen.queryByText("2026")).toBeNull(); expect(screen.queryByText("Browse-only catalog item")).toBeNull(); expect(screen.queryByText(/not represented/u)).toBeNull(); expect(screen.getByText("Approved info").compareDocumentPosition(screen.getByText("Legal")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps a synthetic browse-only item purchase-free without repeating configuration rows", () => {
    const browseOnlyCatalog = buildPublicStorefrontCatalog({
      configuredPublicationId: browseCatalogPublicationId,
      catalogData: {
        products: [],
        bindings: parseStorefrontBindings({ products: [], variants: [] }),
      },
      runtimeVariantFacts: [],
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
    });
    const base = findPublicStorefrontProduct(browseOnlyCatalog, "pinealon")!;
    expect(base.kind).toBe("browse_only");
    const browse = { ...base, displayConfigurations: [{ displayCode: "A", packageForm: "one" }, { displayCode: "B", packageForm: "two" }, { displayCode: "C", packageForm: "three" }] };
    render(<CatalogItemDetail product={browse} pricing={testPricingContext()} relatedProducts={[]} calculator={calculator} />);
    expect(screen.queryByText("A")).toBeNull(); expect(screen.queryByText("B")).toBeNull(); expect(screen.queryByText("C")).toBeNull(); expect(screen.queryByText("Product specifications")).toBeNull(); expect(screen.getByRole("heading", { name: "Compound information" })).toBeVisible(); expect(screen.queryByRole("radio")).toBeNull(); expect(screen.queryByRole("spinbutton")).toBeNull(); expect(screen.queryByRole("button", { name: /add to cart/i })).toBeNull(); expect(screen.queryByRole("status", { name: "Purchase summary" })).toBeNull(); expect(screen.queryByText(/approved information/i)).toBeNull(); expect(document.body).not.toHaveTextContent(/\$|usd/i);
    expect(screen.queryByRole("heading", { name: calculator.title })).toBeNull();
  });

  it("renders configured related products after the main detail grid with the exact pricing reference", () => {
    const pricing = testPricingContext();
    const first = testCanonicalProduct([testPublicVariant({ id: "related-a-v" })], { id: "related-a", name: "Related A" });
    const second = testCanonicalProduct([testPublicVariant({ id: "related-b-v" })], { id: "related-b", name: "Related B" });
    capturedRelated.length = 0;
    render(<CatalogItemDetail product={testCanonicalProduct()} pricing={pricing} relatedProducts={[first, second]} calculator={null} />);
    expect(screen.getByRole("heading", { name: "Related Products" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Related Products" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Related A", "Related B"]);
    expect(screen.getByRole("heading", { name: "Related Products" }).compareDocumentPosition(screen.getByRole("heading", { level: 1, name: "Synthetic Product Alpha" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(capturedRelated[0]?.products).toEqual([first, second]);
    expect(capturedRelated[0]?.pricing).toBe(pricing);
  });

  it("renders the approved calculator after approved information and before related products", () => {
    const content = [{
      id: "approved-info",
      kind: "product_information" as const,
      status: "approved" as const,
      title: "Approved product information",
      body: "Approved product body.",
      literatureReferences: [],
    }];
    const related = testCanonicalProduct(
      [testPublicVariant({ id: "related-calculator-v" })],
      { id: "related-calculator", name: "Related calculator fixture" },
    );
    render(
      <CatalogItemDetail
        calculator={calculator}
        pricing={testPricingContext()}
        product={testCanonicalProduct([], { content: content as never })}
        relatedProducts={[related]}
      />,
    );

    const informationHeading = screen.getByRole("heading", { name: "Approved product information" });
    const calculatorHeading = screen.getByRole("heading", { name: calculator.title });
    const relatedHeading = screen.getByRole("heading", { name: "Related Products" });
    expect(
      informationHeading.compareDocumentPosition(calculatorHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      calculatorHeading.compareDocumentPosition(relatedHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("omits every calculator surface for canonical products when the projection is null", () => {
    render(
      <CatalogItemDetail
        calculator={null}
        pricing={testPricingContext()}
        product={testCanonicalProduct()}
        relatedProducts={[]}
      />,
    );
    expect(screen.queryByRole("heading", { name: /concentration calculator/iu })).toBeNull();
    expect(screen.queryByRole("button", { name: "Calculate" })).toBeNull();
  });
});
