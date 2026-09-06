import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/commerce/cart-view", () => ({
  CartView: () => <div>Cart view fixture</div>,
}));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import CartPage, { metadata } from "./page";

describe("cart route customer language", () => {
  it("presents the cart in customer-facing language without changing its route contract", async () => {
    render(await CartPage({ searchParams: Promise.resolve({}) }));

    expect(metadata.description).toBe("Review your selected products, quantities, and order summary.");
    expect(screen.getByText("Shopping cart")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
    expect(screen.getByText("Review your selected products, quantities, and order summary.")).toBeVisible();
  });
});
