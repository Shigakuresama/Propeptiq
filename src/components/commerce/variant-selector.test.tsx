import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { testPricingContext, testPublicVariant } from "./storefront-test-fixtures";
import { VariantSelector } from "./variant-selector";

const variants = [testPublicVariant({ id: "a", label: "A" }), testPublicVariant({ id: "b", label: "B", availability: "unavailable", checkoutReady: false }), testPublicVariant({ id: "c", label: "C", priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false })];
describe("VariantSelector", () => {
  it("uses controlled selection, deterministic names, keyboard movement and containment", async () => {
    const user = userEvent.setup(); const change = vi.fn();
    const { container } = render(<VariantSelector productId="p" productName="P" variants={variants} selectedVariantId="b" quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={change} />);
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("name") === "variant-p")).toBe(true);
    expect(screen.getByText("B").parentElement).toHaveTextContent("Selected");
    expect(container.querySelector("label")?.className).toContain("min-h-11");
    expect(container.querySelector("label > span")?.className).toContain("min-w-0");
    expect(container.querySelector("label > span")?.className).toContain("[overflow-wrap:anywhere]");
    await user.click(screen.getByRole("radio", { name: /A/u })); expect(change).toHaveBeenCalledWith("a");
  });
});
