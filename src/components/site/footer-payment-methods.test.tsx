import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FooterPaymentMethods } from "./footer-payment-methods";

describe("FooterPaymentMethods", () => {
  it("labels processor capabilities without claiming these methods are accepted by the store", () => {
    const { container } = render(<FooterPaymentMethods />);
    expect(screen.getByText("Stripe-supported methods")).toBeVisible();
    expect(screen.getByText("Available options vary by country and checkout.")).toBeVisible();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector(".footer-payment-methods__marks")).toHaveAttribute("aria-hidden", "true");
    expect(container).not.toHaveTextContent(/we accept|accepted here|coming soon|payments enabled/iu);
    expect(container.querySelector("img")).toBeNull();
  });

  it("opens the complete official method inventory from its focusable native summary and links to its source", async () => {
    const user = userEvent.setup();
    const { container } = render(<FooterPaymentMethods />);
    const summary = screen.getByText("Stripe-supported methods").closest("summary")!;
    await user.tab();
    expect(summary).toHaveFocus();
    // JSDOM does not implement Enter's native summary activation; browser
    // verification exercises that behavior without adding a custom handler.
    await user.click(summary);
    expect(container.querySelector("details")).toHaveAttribute("open");

    // Stripe overview, verified 2026-09-06: 65 category entries / 64 methods.
    // PayNow is documented under both bank redirects and real-time payments.
    const entries = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(entries).toHaveLength(65);
    expect(new Set(entries).size).toBe(64);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Cards", "Bank debits", "Bank redirects", "Bank transfers", "Buy now, pay later", "Real-time payments", "Vouchers", "Wallets",
    ]);
    for (const name of ["Interac (in-person only)", "NZ BECS Direct Debit", "iDEAL | Wero", "Japan Bank Transfer (Furikomi)", "Meses sin intereses", "Swish (invite only)", "Boleto", "Secure Remote Commerce", "Stablecoins and crypto", "PayCo"]) {
      expect(entries).toContain(name);
    }
    const wallets = screen.getByRole("region", { name: "Wallets" });
    expect(within(wallets).getAllByRole("listitem")).toHaveLength(19);
    const source = screen.getByRole("link", { name: "View Stripe’s method availability" });
    expect(source).toHaveAttribute("href", "https://docs.stripe.com/payments/payment-methods/overview");
    expect(source).toHaveClass("min-h-11", "min-w-11", "focus-visible:ring-2");
    await user.click(summary);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(summary).toHaveFocus();
  });
});
