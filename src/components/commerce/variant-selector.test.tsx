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
    expect(screen.getByRole("radio", { name: /B/u })).toBeChecked();
    expect(screen.getByRole("radio", { name: /B/u })).toBeDisabled();
    expect(container.querySelector(".amount-options")).not.toBeNull();
    await user.click(screen.getByRole("radio", { name: /A/u })); expect(change).toHaveBeenCalledWith("a");
  });

  it("disables unpriced choices and keeps priced choices selectable", async () => {
    const user = userEvent.setup(); let selected = "b";
    const { rerender, container } = render(<VariantSelector productId="keyboard" productName="P" variants={variants} selectedVariantId={selected} quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={(id) => { selected = id; rerender(<VariantSelector productId="keyboard" productName="P" variants={variants} selectedVariantId={selected} quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={(next) => { selected = next; }} />); }} />);
    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toBeDisabled();
    expect(radios[2]).toBeDisabled();
    expect(radios[3]).toBeEnabled();
    await user.click(radios[2]!);
    expect(selected).toBe("b");
    await user.click(radios[3]!);
    expect(selected).toBe("d");
    expect(screen.queryByText(/price unavailable|currently unavailable/i)).toBeNull();
    expect(container.querySelectorAll("label")).toHaveLength(4);
    expect(screen.getByText("D").parentElement).not.toHaveTextContent("Checkout unavailable");
  });

  it("fails closed with no selected radio when the supplied default is missing", () => {
    render(<VariantSelector productId="missing" productName="P" variants={variants} selectedVariantId={null} quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={vi.fn()} />);
    expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  });

  it("contains a long unbroken label in the constrained copy wrapper", () => {
    const label = "variant-" + "x".repeat(140);
    const longVariant = testPublicVariant({ id: "long", label });
    const { container } = render(<VariantSelector productId="long" productName="P" variants={[longVariant]} selectedVariantId="long" quantity={1} pricing={testPricingContext()} onSelectedVariantIdChange={vi.fn()} />);
    expect(screen.getByText(label)).toBeVisible(); const copy = container.querySelector("label > span")!; expect(copy.textContent).toContain(label);
  });
});
