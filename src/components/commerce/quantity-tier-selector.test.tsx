import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuantityTierSelector } from "./quantity-tier-selector";
describe("QuantityTierSelector", () => {
  it("keeps exact presets and controls available", () => {
    const select = vi.fn(); const change = vi.fn(); const { container } = render(<QuantityTierSelector quantity={1} quantityDraft="1" errorId="q-error" errorMessage={null} onQuantityDraftChange={change} onQuantitySelect={select} />);
    expect(screen.getByRole("button", { name: "1 bottle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "10 or more bottles" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveAttribute("min", "1");
    expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveAttribute("max", "25"); expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveAttribute("step", "1");
    expect(container.querySelector("input")?.className).toContain("min-h-11");
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "11" } }); expect(change).toHaveBeenCalledWith("11");
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });

  it("emits every preset and boundary control through the controlled API", () => {
    const select = vi.fn(); const change = vi.fn(); const { container, rerender } = render(<QuantityTierSelector quantity={1} quantityDraft="1" errorId="q-error" errorMessage={null} onQuantityDraftChange={change} onQuantitySelect={select} />);
    for (const label of ["1 bottle", "2 bottles", "3 bottles", "10 or more bottles"]) { screen.getByRole("button", { name: label }).click(); }
    expect(select.mock.calls.map(([value]) => value)).toEqual([1, 2, 3, 10]);
    rerender(<QuantityTierSelector quantity={25} quantityDraft="25" errorId="q-error" errorMessage={null} onQuantityDraftChange={change} onQuantitySelect={select} />);
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled(); screen.getByRole("button", { name: "Decrease quantity" }).click(); expect(select).toHaveBeenLastCalledWith(24);
    expect(container.querySelector("button[aria-label='Decrease quantity']")?.className).toContain("min-w-11");
  });

  it.each(["", "1.0", "1e1", "abc", "0", "-1", "26"])("renders the exact linked error for invalid draft %s", (value) => {
    const { rerender } = render(<QuantityTierSelector quantity={1} quantityDraft={value} errorId="exact-error" errorMessage="Enter a whole number from 1 to 25." onQuantityDraftChange={vi.fn()} onQuantitySelect={vi.fn()} />);
    rerender(<QuantityTierSelector quantity={1} quantityDraft={value} errorId="exact-error" errorMessage="Enter a whole number from 1 to 25." onQuantityDraftChange={vi.fn()} onQuantitySelect={vi.fn()} />);
    const input = screen.getByRole("spinbutton", { name: "Exact quantity" }); expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAttribute("aria-describedby", "exact-error"); expect(screen.getByText("Enter a whole number from 1 to 25.")).toBeVisible();
  });
});
