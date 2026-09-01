import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { testPricingContext, testPublicVariant } from "./storefront-test-fixtures";
import { VariantSelector } from "./variant-selector";

const variants = [testPublicVariant({ id: "a", label: "A" }), testPublicVariant({ id: "b", label: "B", availability: "unavailable", checkoutReady: false }), testPublicVariant({ id: "c", label: "C", priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }), testPublicVariant({ id: "d", label: "D", checkoutReady: false })];
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

  it("moves visible selection with native arrow keys and keeps every unsafe option inspectable", async () => {
    const user = userEvent.setup(); let selected = "b";
    const { rerender, container } = render(<VariantSelector productId="keyboard" productName="P" variants={variants} selectedVariantId={selected} quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={(id) => { selected = id; rerender(<VariantSelector productId="keyboard" productName="P" variants={variants} selectedVariantId={selected} quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={(next) => { selected = next; }} />); }} />);
    const radios = screen.getAllByRole("radio"); await user.click(radios[1]!); await user.keyboard("{ArrowDown}");
    expect(screen.getByText("C").parentElement).toHaveTextContent("Selected"); expect(screen.getByText(/5 mg.*Unavailable/u)).toBeVisible();
    expect(container.querySelectorAll("label")).toHaveLength(4); expect(container.querySelector("label")?.className).toContain("min-h-11");
    expect(screen.getByText("D").parentElement).toHaveTextContent("Checkout unavailable");
  });

  it("fails closed with no selected radio when the supplied default is missing", () => {
    render(<VariantSelector productId="missing" productName="P" variants={variants} selectedVariantId={null} quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={vi.fn()} />);
    expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  });
});
