import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentity, getRequestRepositories, loadOrder, notFound } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(), getRequestRepositories: vi.fn(), loadOrder: vi.fn(),
  notFound: vi.fn(() => { throw new Error("not-found"); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/auth/server", () => ({ getRequestIdentity, getRequestRepositories }));

import OrderDetailPage from "./page";

const orderId = "71000000-0000-4000-8000-000000000001";

describe("order detail customer copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentity.mockResolvedValue({
      environment: { DATABASE_MODE: "disabled" },
      identity: { clerkUserId: "buyer", primaryEmail: "buyer@example.test", emailVerifiedAt: "2026-09-04T00:00:00.000Z", mfaConfigured: false, secondFactorCompleted: false },
      principal: { actorId: "50000000-0000-4000-8000-000000000004", clerkUserId: "buyer", buyerStatus: "active", capabilities: [], mfaSatisfied: false },
    });
    getRequestRepositories.mockReturnValue({ loadOrder });
    loadOrder.mockResolvedValue({
      id: orderId, state: "checkout_pending", totalMinor: 2400, currency: "USD",
      destinationStateCode: "CA", createdAt: "2026-09-04T00:00:00.000Z",
      paymentState: "pending_verification", refundState: "none", holdState: "none",
      releaseState: "none", shipmentState: "none", items: [],
    });
  });

  it("labels the record as the customer's order and preserves factual states", async () => {
    const markup = renderToStaticMarkup(await OrderDetailPage({ params: Promise.resolve({ orderId }) }));
    expect(markup).toContain("Your order");
    expect(markup).toContain("pending verification");
    expect(loadOrder).toHaveBeenCalledWith(orderId);
  });

  it("uses not-found for an unavailable owner-scoped record", async () => {
    loadOrder.mockResolvedValue(null);
    await expect(OrderDetailPage({ params: Promise.resolve({ orderId }) })).rejects.toThrow("not-found");
  });
});
