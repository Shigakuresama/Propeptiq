import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  testCanonicalProduct,
  testPricingContext,
  testPublicVariant,
  testWinter30,
} from "@/components/commerce/storefront-test-fixtures";

const { addVariantMock } = vi.hoisted(() => ({
  addVariantMock: vi.fn(),
}));

vi.mock("@/cart/cart-provider", () => ({
  useCart: () => ({ addVariant: addVariantMock }),
}));

import { VariantAddTrigger } from "./quick-add-variant-sheet";

const fiveMg = testPublicVariant({
  id: "variant-5mg",
  label: "5 mg",
  amount: { value: 5, unit: "mg" },
  baseUnitMinor: 1_000,
});
const tenMg = testPublicVariant({
  id: "variant-10mg",
  label: "10 mg",
  amount: { value: 10, unit: "mg" },
  baseUnitMinor: 2_000,
});

function renderTrigger(
  product = testCanonicalProduct([fiveMg, tenMg], {
    defaultVariantId: "variant-10mg",
  }),
  pricing = testPricingContext("test"),
) {
  return render(<VariantAddTrigger product={product} pricing={pricing} />);
}

describe("QuickAddVariantSheet", () => {
  beforeEach(() => {
    addVariantMock.mockReset();
    addVariantMock.mockReturnValue(true);
  });

  it("accepts one pricing context and exposes no contradictory mode prop", () => {
    type Props = ComponentProps<typeof VariantAddTrigger>;
    expectTypeOf<"mode" extends keyof Props ? true : false>().toEqualTypeOf<false>();
  });

  it("opens without adding, selects the explicit default, supports native radio keys, confirms, closes, and restores focus", async () => {
    const user = userEvent.setup();
    renderTrigger();
    const trigger = screen.getByRole("button", {
      name: "Add Synthetic Product Alpha: choose a variant",
    });
    trigger.focus();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Choose a variant for Synthetic Product Alpha",
    });
    expect(addVariantMock).not.toHaveBeenCalled();

    const five = within(dialog).getByRole("radio", { name: /5 mg/iu });
    const ten = within(dialog).getByRole("radio", { name: /10 mg/iu });
    expect(ten).toBeChecked();
    expect(five).not.toBeChecked();

    ten.focus();
    await user.keyboard("{ArrowUp}");
    expect(five).toBeChecked();

    const confirm = within(dialog).getByRole("button", {
      name: "Add Synthetic Product Alpha to cart",
    });
    confirm.focus();
    await user.keyboard("{Enter}");

    expect(addVariantMock).toHaveBeenCalledTimes(1);
    expect(addVariantMock).toHaveBeenCalledWith("variant-5mg", 1, {
      productName: "Synthetic Product Alpha",
      variantLabel: "5 mg",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("restores trigger focus after Escape and the labelled close button", async () => {
    const user = userEvent.setup();
    renderTrigger();
    const trigger = screen.getByRole("button", {
      name: "Add Synthetic Product Alpha: choose a variant",
    });

    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
    expect(addVariantMock).not.toHaveBeenCalled();
  });

  it("stays open when the cart rejects a normalized add", async () => {
    const user = userEvent.setup();
    addVariantMock.mockReturnValue(false);
    renderTrigger();

    await user.click(
      screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Choose a variant for Synthetic Product Alpha",
    });
    await user.click(
      within(dialog).getByRole("button", {
        name: "Add Synthetic Product Alpha to cart",
      }),
    );

    expect(addVariantMock).toHaveBeenCalledTimes(1);
    expect(dialog).toBeVisible();
  });

  it("contains an owner-approved unbroken variant label on a narrow sheet", async () => {
    const user = userEvent.setup();
    const longLabel = "SYNTHETICUNBROKENVARIANTLABEL".repeat(8);
    renderTrigger(
      testCanonicalProduct([
        testPublicVariant({
          id: "variant-long-label",
          label: longLabel,
        }),
      ], {
        defaultVariantId: "variant-long-label",
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }),
    );
    const label = within(screen.getByRole("dialog")).getByText(longLabel);
    const copyColumn = label.parentElement;
    expect(copyColumn).not.toBeNull();
    expect(copyColumn).toHaveClass("min-w-0", "[overflow-wrap:anywhere]");
  });

  it("renders shared price semantics and disables unavailable or malformed pending rows", async () => {
    const user = userEvent.setup();
    const unavailable = testPublicVariant({
      id: "variant-unavailable",
      label: "Unavailable option",
      amount: null,
      availability: "unavailable",
      priceStatus: "unavailable",
      baseUnitMinor: null,
      currency: null,
      checkoutReady: false,
    });
    const pendingPositive = testPublicVariant({
      id: "variant-pending",
      label: "Pending option",
      amount: null,
      availability: "preview_only",
      priceStatus: "pending",
      baseUnitMinor: 2_500,
      checkoutReady: false,
    });
    renderTrigger(
      testCanonicalProduct([unavailable, pendingPositive, fiveMg], {
        defaultVariantId: unavailable.id,
      }),
      testPricingContext("test", [testWinter30]),
    );

    await user.click(
      screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }),
    );
    const dialog = screen.getByRole("dialog");
    const unavailableRadio = within(dialog).getByRole("radio", {
      name: /Unavailable option/iu,
    });
    const pendingRadio = within(dialog).getByRole("radio", {
      name: /Pending option/iu,
    });
    expect(unavailableRadio).toBeDisabled();
    expect(pendingRadio).toBeDisabled();
    expect(within(dialog).getAllByText("Pricing coming soon").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("$25.00")).toBeNull();
    expect(within(dialog).getByText("$10.00").tagName).toBe("DEL");
    expect(within(dialog).getByText("$7.00").tagName).toBe("STRONG");

    const confirm = within(dialog).getByRole("button", {
      name: /synthetic product alpha unavailable/iu,
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleName("Synthetic Product Alpha unavailable");
    expect(confirm).toHaveTextContent("This variant is unavailable.");
    expect(confirm).toHaveAttribute("title", "This variant is unavailable.");
    expect(confirm).not.toHaveTextContent(/cart testing/iu);
    await user.click(confirm);
    expect(addVariantMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("radio", { name: /5 mg/iu }));
    await user.click(
      within(dialog).getByRole("button", {
        name: "Add Synthetic Product Alpha to cart",
      }),
    );
    expect(addVariantMock).toHaveBeenCalledWith("variant-5mg", 1, {
      productName: "Synthetic Product Alpha",
      variantLabel: "5 mg",
    });
  });

  it("keeps production pending zero honest and non-addable even with an automatic promotion", async () => {
    const user = userEvent.setup();
    const pendingZero = testPublicVariant({
      id: "variant-zero",
      label: "Zero preview",
      availability: "preview_only",
      priceStatus: "pending",
      baseUnitMinor: 0,
      checkoutReady: false,
    });
    renderTrigger(
      testCanonicalProduct([pendingZero, tenMg], {
        defaultVariantId: pendingZero.id,
      }),
      testPricingContext("production", [testWinter30]),
    );

    await user.click(
      screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }),
    );
    const dialog = screen.getByRole("dialog");
    const zero = within(dialog).getByRole("radio", { name: /Zero preview/iu });
    const zeroRow = zero.closest("label");
    expect(zeroRow).not.toBeNull();
    if (zeroRow === null) return;
    expect(zero).toBeChecked();
    expect(zero).toBeDisabled();
    expect(within(zeroRow).getByText("Pricing coming soon")).toBeVisible();
    expect(within(zeroRow).queryByText("$0.00")).toBeNull();
    expect(within(zeroRow).queryByText("-30%")).toBeNull();
    const confirm = within(dialog).getByRole("button", {
      name: /synthetic product alpha unavailable/iu,
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleName("Synthetic Product Alpha unavailable");
    expect(confirm).toHaveTextContent("Pricing coming soon.");
    expect(confirm).toHaveAttribute("title", "Pricing coming soon.");
    expect(confirm).not.toHaveTextContent(/cart testing/iu);
  });

  it("uses neutral cart-unavailable copy for a non-addable state that is still display-priced", async () => {
    const user = userEvent.setup();
    const inconsistentReadiness = testPublicVariant({
      id: "variant-inconsistent-readiness",
      label: "Display-priced only",
      availability: "available",
      priceStatus: "active",
      baseUnitMinor: 2_500,
      checkoutReady: false,
    });
    renderTrigger(
      testCanonicalProduct([inconsistentReadiness], {
        defaultVariantId: inconsistentReadiness.id,
      }),
      testPricingContext("production"),
    );

    await user.click(
      screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }),
    );

    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: /synthetic product alpha unavailable/iu,
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent("This variant cannot be added to the cart.");
    expect(confirm).toHaveAttribute("title", "This variant cannot be added to the cart.");
    expect(confirm).not.toHaveTextContent(/cart testing/iu);
    expect(within(screen.getByRole("dialog")).getByText("Checkout unavailable")).toBeVisible();
  });

  it("adds the exact positive preview-only Production variant while pending stays disabled", async () => {
    const user = userEvent.setup();
    const previewOnly = testPublicVariant({
      id: "production-preview-variant", label: "30 mg", availability: "preview_only", checkoutReady: false,
    });
    const pending = testPublicVariant({
      id: "production-pending-variant", label: "Pending", availability: "preview_only",
      priceStatus: "pending", baseUnitMinor: 0, checkoutReady: false,
    });
    renderTrigger(
      testCanonicalProduct([previewOnly, pending], { defaultVariantId: previewOnly.id }),
      testPricingContext("production", [testWinter30]),
    );
    await user.click(screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /30 mg/iu })).toBeEnabled();
    expect(within(dialog).getByRole("radio", { name: /Pending/iu })).toBeDisabled();
    expect(within(dialog).getByText("Cart preview only")).toBeVisible();
    const confirm = within(dialog).getByRole("button", {
      name: "Add Synthetic Product Alpha to preview cart",
    });
    expect(confirm).toHaveTextContent("Add to preview cart");
    await user.click(confirm);
    expect(addVariantMock).toHaveBeenCalledExactlyOnceWith("production-preview-variant", 1, {
      productName: "Synthetic Product Alpha", variantLabel: "30 mg",
    });
  });
});
