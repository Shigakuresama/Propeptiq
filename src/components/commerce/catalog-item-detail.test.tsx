import { render, screen, within } from "@testing-library/react";
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
import { testPricingContext, testCanonicalProduct, testPublicVariant } from "./storefront-test-fixtures";

const calculator = Object.freeze({
  title: "Synthetic approved calculator",
  body: "Synthetic approved body.",
  limits: Object.freeze({ maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 10 }),
});

const { capturedPricing } = vi.hoisted(() => ({ capturedPricing: [] as unknown[] }));
vi.mock("./product-purchase-panel", () => ({ ProductPurchasePanel: ({ pricing }: { pricing: unknown }) => { capturedPricing.push(pricing); return <div data-testid="purchase-panel" />; } }));
const { capturedRelated } = vi.hoisted(() => ({ capturedRelated: [] as Array<{ products: unknown; pricing: unknown }> }));
vi.mock("./related-products-carousel", () => ({ RelatedProductsCarousel: (props: { products: unknown; pricing: unknown }) => { capturedRelated.push(props); return <section aria-label="Frequently Researched Together"><h2>Frequently Researched Together</h2><ul>{(props.products as Array<{ name: string }>).map((product) => <li key={product.name}>{product.name}</li>)}</ul></section>; } }));

describe("CatalogItemDetail", () => {
  const catalog = buildPublicStorefrontCatalog({
    configuredPublicationId: browseCatalogPublicationId,
    catalogData: storefrontCatalogData,
    runtimeVariantFacts: [],
    controlledContent: [],
    verifiedImageMetadata: storefrontImageMetadata,
  });

  it("shows every supplied variant and exposes a normalized source label", () => {
    const product = findPublicStorefrontProduct(catalog, "pinealon")!;
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} relatedProducts={[]} calculator={null} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Pinealon" });
    const intro = heading.closest("header");
    expect(heading).toBeVisible();
    expect(intro).toHaveAttribute("data-motion-sequence", "dossier-intro");
    expect(intro?.querySelectorAll("[data-motion-step]")).toHaveLength(3);
    const image = screen.getByRole("img", { name: product.image.alt });
    const suppliedConfigurations = screen.getByRole("heading", {
      name: "Supplied configurations",
    });
    expect(image).toBeVisible();
    expect(
      heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      image.compareDocumentPosition(suppliedConfigurations) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(image.closest(".catalog-detail-image")).toHaveClass(
      "lg:col-start-1",
      "lg:row-start-1",
      "lg:row-span-2",
    );
    expect(suppliedConfigurations.closest(".catalog-detail-content")).toHaveClass(
      "pt-16",
      "lg:col-start-2",
      "lg:row-start-2",
      "lg:pt-0",
    );
    expect(screen.getByText("Source label: Pinealon10mg")).toBeVisible();
    expect(screen.getByText("PN5")).toBeVisible();
    expect(screen.getByText("5mg")).toBeVisible();
    expect(screen.queryByText("5mg × 10 vials")).not.toBeInTheDocument();
    expect(screen.getByText("Illustrative product presentation")).toBeVisible();
    expect(screen.queryByRole("button", { name: /add to cart/i })).toBeNull();
    expect(document.body).not.toHaveTextContent(/\$|usd/i);
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

    const variantRow = screen.getByText(code).closest("li");
    expect(variantRow).not.toBeNull();
    expect(within(variantRow!).getByText(`Source label: ${sourceName}`)).toBeVisible();
  });

  it("renders only approved allowed content literally and forwards exact pricing", () => {
    const pricing = testPricingContext(); capturedPricing.length = 0;
    const content = [
      { id: "info", kind: "product_information" as const, status: "approved" as const, title: "Approved info", body: "literal <em>text</em>", sourceReferences: ["secret"], approvalNote: "private", reviewedAt: "2026", effectiveAt: "2026" },
      { id: "draft", kind: "legal_notice" as const, status: "draft" as const, title: "Draft", body: "DRAFT", sourceReferences: [], approvalNote: null, reviewedAt: null, effectiveAt: null },
      { id: "faq", kind: "faq" as const, status: "approved" as const, title: "FAQ", body: "FAQ", sourceReferences: [], approvalNote: null, reviewedAt: null, effectiveAt: null },
      { id: "legal", kind: "legal_notice" as const, status: "approved" as const, title: "Legal", body: "Approved legal", sourceReferences: [], approvalNote: null, reviewedAt: null, effectiveAt: null },
    ];
    const product = testCanonicalProduct([], { content: content as never, description: "raw description" });
    render(<CatalogItemDetail product={product} pricing={pricing} relatedProducts={[]} calculator={null} />);
    expect(screen.getByTestId("purchase-panel")).toBeVisible(); expect(capturedPricing[0]).toBe(pricing); expect(screen.getByText("literal <em>text</em>")).toBeVisible(); expect(screen.getByText("Approved legal")).toBeVisible();
    expect(screen.queryByText("raw description")).toBeNull(); expect(screen.queryByText("DRAFT")).toBeNull(); expect(screen.queryByText("FAQ")).toBeNull(); expect(screen.queryByText("private")).toBeNull(); expect(screen.queryByText("secret")).toBeNull(); expect(screen.queryByText("2026")).toBeNull(); expect(screen.queryByText("Browse-only catalog item")).toBeNull(); expect(screen.queryByText(/not represented/u)).toBeNull(); expect(screen.getByText("Approved info").compareDocumentPosition(screen.getByText("Legal")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps a synthetic browse-only item entirely purchase-free with all configurations", () => {
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
    expect(screen.getByText("A")).toBeVisible(); expect(screen.getByText("B")).toBeVisible(); expect(screen.getByText("C")).toBeVisible(); expect(screen.queryByRole("radio")).toBeNull(); expect(screen.queryByRole("spinbutton")).toBeNull(); expect(screen.queryByRole("button", { name: /add to cart/i })).toBeNull(); expect(screen.queryByRole("status", { name: "Purchase summary" })).toBeNull(); expect(screen.queryByText(/approved information/i)).toBeNull(); expect(document.body).not.toHaveTextContent(/\$|usd/i);
    expect(screen.queryByRole("heading", { name: calculator.title })).toBeNull();
  });

  it("renders configured related products after the main detail grid with the exact pricing reference", () => {
    const pricing = testPricingContext();
    const first = testCanonicalProduct([testPublicVariant({ id: "related-a-v" })], { id: "related-a", name: "Related A" });
    const second = testCanonicalProduct([testPublicVariant({ id: "related-b-v" })], { id: "related-b", name: "Related B" });
    capturedRelated.length = 0;
    render(<CatalogItemDetail product={testCanonicalProduct()} pricing={pricing} relatedProducts={[first, second]} calculator={null} />);
    expect(screen.getByRole("heading", { name: "Frequently Researched Together" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Frequently Researched Together" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Related A", "Related B"]);
    expect(screen.getByRole("heading", { name: "Frequently Researched Together" }).compareDocumentPosition(screen.getByRole("heading", { level: 1, name: "Synthetic Product Alpha" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
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
      sourceReferences: [],
      approvalNote: null,
      reviewedAt: null,
      effectiveAt: null,
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
    const relatedHeading = screen.getByRole("heading", { name: "Frequently Researched Together" });
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
