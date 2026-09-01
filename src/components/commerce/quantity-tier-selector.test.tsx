import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuantityTierSelector } from "./quantity-tier-selector";
describe("QuantityTierSelector", () => {
  it("keeps exact presets and controls available", () => {
    const select = vi.fn(); const change = vi.fn(); const { container } = render(<QuantityTierSelector quantity={1} quantityDraft="1" errorId="q-error" errorMessage={null} onQuantityDraftChange={change} onQuantitySelect={select} />);
    expect(screen.getByRole("button", { name: "1 bottle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "10 or more bottles" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveAttribute("min", "1");
    expect(container.querySelector("input")?.className).toContain("min-h-11");
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "11" } }); expect(change).toHaveBeenCalledWith("11");
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });
});
