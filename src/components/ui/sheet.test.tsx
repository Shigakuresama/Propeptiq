import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

function SheetFixture({ motionScope }: { motionScope?: "public" }) {
  return (
    <Sheet>
      <SheetTrigger>Open details</SheetTrigger>
      <SheetContent {...(motionScope === undefined ? {} : { motionScope })}>
        <SheetTitle>Motion details</SheetTitle>
        <SheetDescription>Real portal content.</SheetDescription>
        <p>Sheet body</p>
      </SheetContent>
    </Sheet>
  );
}

describe("SheetContent motion scope", () => {
  it("marks the real public portal content and overlay and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<SheetFixture motionScope="public" />);
    const trigger = screen.getByRole("button", { name: "Open details" });

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Motion details" });
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(dialog).toHaveAttribute("data-motion-scope", "public");
    expect(overlay).toHaveAttribute("data-motion-scope", "public");
    expect(screen.getByText("Real portal content.")).toBeVisible();
    expect(screen.getByText("Sheet body")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("leaves unmarked portal content and overlay on the generic sheet path", async () => {
    const user = userEvent.setup();
    render(<SheetFixture />);

    await user.click(screen.getByRole("button", { name: "Open details" }));

    expect(screen.getByRole("dialog", { name: "Motion details" }))
      .not.toHaveAttribute("data-motion-scope");
    expect(document.querySelector('[data-slot="sheet-overlay"]'))
      .not.toHaveAttribute("data-motion-scope");
  });
});
