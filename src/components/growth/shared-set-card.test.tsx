import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharedSetCard } from "./shared-set-card";

const publicItems = Object.freeze([
  Object.freeze({
    productId: "product-a",
    quantity: 2,
    slug: "reference-a",
    name: "Reference A",
    packageForm: "sealed research unit",
  }),
]);

describe("SharedSetCard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders only current public product facts and neutral set actions", () => {
    const { container } = render(
      <SharedSetCard
        variant="public"
        label="Analytical reference set"
        items={publicItems}
        omissionNotice="One saved product is no longer available and was omitted."
        actions={<button type="button">Add set to cart</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Analytical reference set" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reference A" })).toHaveAttribute(
      "href",
      "/catalog/reference-a",
    );
    expect(screen.getByText("sealed research unit · Quantity 2")).toBeVisible();
    expect(screen.getByText(/one saved product is no longer available and was omitted/iu)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add set to cart" })).toBeVisible();
    expect(container.textContent).not.toMatch(/owner|email|price|discount|inventory|policy|medical/iu);
  });

  it("shows text-and-icon owner status and exposes public actions only while active", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { rerender } = render(
      <SharedSetCard
        variant="owner"
        code="set_Task7C2OwnerCode1"
        label="Analytical reference set"
        itemCount={2}
        active
      >
        <button type="button">Edit set</button>
        <button type="button">Deactivate set</button>
      </SharedSetCard>,
    );

    const activeStatus = screen.getByText("Active").closest("span");
    expect(activeStatus).not.toBeNull();
    expect(activeStatus?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("2 saved products")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open public link" })).toHaveAttribute(
      "href",
      "/sets/set_Task7C2OwnerCode1",
    );
    expect(screen.getByRole("button", { name: "Edit set" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Deactivate set" })).toBeVisible();

    const copyButton = screen.getByRole("button", { name: "Copy public link" });
    await user.click(copyButton);
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/sets\/set_Task7C2OwnerCode1$/u),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Public link copied.");
    expect(copyButton).toHaveFocus();

    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    await user.click(copyButton);
    expect(screen.getByRole("status")).toHaveTextContent("Public link could not be copied.");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(copyButton).toHaveFocus();

    rerender(
      <SharedSetCard
        variant="owner"
        code="set_Task7C2OwnerCode1"
        label="Analytical reference set"
        itemCount={2}
        active={false}
      >
        <button type="button">Edit set</button>
      </SharedSetCard>,
    );

    const inactiveStatus = screen.getByText("Inactive").closest("span");
    expect(inactiveStatus).not.toBeNull();
    expect(inactiveStatus?.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Open public link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy public link" })).toBeNull();
    expect(within(screen.getByRole("article")).getByRole("button", { name: "Edit set" })).toBeVisible();
  });
});
