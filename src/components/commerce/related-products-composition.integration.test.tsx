import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { CatalogItemDetail } from "./catalog-item-detail";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";

describe("real detail related composition", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders the real detail → carousel → card path and adds a related item", async () => {
    const user = userEvent.setup();
    const related = testCanonicalProduct([testPublicVariant({ id: "composition-v", label: "5 mg" })], { id: "composition-related", name: "Composition Related" });
    render(<CartProvider><CatalogItemDetail product={testCanonicalProduct()} pricing={testPricingContext()} relatedProducts={[related]} /></CartProvider>);
    const section = screen.getByRole("region", { name: "Frequently Researched Together" });
    expect(section).toBeVisible();
    expect(within(section).getByRole("heading", { name: "Frequently Researched Together" })).toBeVisible();
    expect(within(section).getByRole("heading", { name: "Composition Related" })).toBeVisible();
    expect(section.compareDocumentPosition(screen.getByRole("heading", { level: 1, name: "Synthetic Product Alpha" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const image = within(section).getByRole("img", { name: "Synthetic fixture image" });
    expect(image.parentElement).toHaveClass("catalog-image-frame");
    expect(related.image.width).toBe(1254);
    expect(related.image.height).toBe(1254);
    expect(image).toHaveAttribute("sizes");
    expect(image).toHaveAttribute("loading", "lazy");
    await user.click(within(section).getByRole("button", { name: "Add Composition Related to cart" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Composition Related, 5 mg: 1 unit"));
  });
});
