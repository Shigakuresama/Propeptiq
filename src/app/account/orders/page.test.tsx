import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentity, getRequestRepositories, listOrders } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(), getRequestRepositories: vi.fn(), listOrders: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/server", () => ({ getRequestIdentity, getRequestRepositories }));

import OrdersPage from "./page";

describe("order history customer copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentity.mockResolvedValue({
      environment: { DATABASE_MODE: "disabled" },
      identity: { clerkUserId: "buyer", primaryEmail: "buyer@example.test", emailVerifiedAt: "2026-09-04T00:00:00.000Z", mfaConfigured: false, secondFactorCompleted: false },
      principal: { actorId: "50000000-0000-4000-8000-000000000004", clerkUserId: "buyer", buyerStatus: "active", capabilities: [], mfaSatisfied: false },
    });
    getRequestRepositories.mockReturnValue({ listOrders });
    listOrders.mockResolvedValue([]);
  });

  it("describes owner filtering and empty order creation without implying payment", async () => {
    const markup = renderToStaticMarkup(await OrdersPage());
    expect(markup).toContain("Your orders");
    expect(markup).toContain("Only orders for this signed-in account are shown.");
    expect(markup).toContain("Orders will appear here after checkout creates an order record.");
    expect(markup).not.toContain("after payment");
  });
});
