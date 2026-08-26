import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentity, getRequestRepositories, loadCheckoutSuccess, notFound } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
  loadCheckoutSuccess: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => `/checkout/success/${orderId}`,
}));
vi.mock("@/auth/server", () => ({ getRequestIdentity, getRequestRepositories }));

import CheckoutSuccessPage, { dynamic, metadata } from "./page";

const ownerId = "50000000-0000-4000-8000-000000000004";
const orderId = "71000000-0000-4000-8000-000000000001";

describe("checkout success page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentity.mockResolvedValue({
      environment: { DATABASE_MODE: "disabled" },
      identity: {
        clerkUserId: "local-customer",
        primaryEmail: "buyer@example.test",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: {
        actorId: ownerId,
        clerkUserId: "local-customer",
        buyerStatus: "active",
        capabilities: [],
        mfaSatisfied: false,
      },
      localDriver: {},
    });
    loadCheckoutSuccess.mockResolvedValue({
      orderId,
      state: "checkout_pending",
      currency: "USD",
      subtotalMinor: 4_800,
      discountMinor: 480,
      shippingMinor: 500,
      taxMinor: 321,
      totalMinor: 5_141,
      paymentState: "pending_verification",
      refundState: "none",
      holdState: "none",
      releaseState: "none",
      shipmentState: "none",
      createdAt: "2026-08-26T12:00:00.000Z",
      updatedAt: "2026-08-26T12:00:00.000Z",
      items: [{
        id: "72000000-0000-4000-8000-000000000001",
        productName: "Synthetic local test only — Alpha",
        packageForm: "Research vial",
        quantity: 2,
        unitAmountMinor: 2_400,
        subtotalMinor: 4_800,
        discountMinor: 480,
        totalMinor: 4_320,
      }],
    });
    getRequestRepositories.mockReturnValue({ loadCheckoutSuccess });
  });

  it("renders a no-store owner-only pending read without claiming payment", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata).toMatchObject({ robots: { index: false, follow: false } });
    const markup = renderToStaticMarkup(await CheckoutSuccessPage({
      params: Promise.resolve({ orderId }),
    }));

    expect(markup).toContain("Payment verification pending");
    expect(markup).toContain(">Synthetic local test only<");
    expect(markup).toContain("$51.41");
    expect(markup).toContain("Synthetic local test only — Alpha");
    expect(markup).not.toContain("buyer@example.test");
    expect(markup).not.toMatch(/address|provider session|paymentintent/iu);
    expect(loadCheckoutSuccess).toHaveBeenCalledOnce();
    expect(loadCheckoutSuccess).toHaveBeenCalledWith(orderId);
  });

  it("uses the same not-found response for malformed or cross-owner records", async () => {
    loadCheckoutSuccess.mockResolvedValue(null);
    await expect(CheckoutSuccessPage({
      params: Promise.resolve({ orderId: "not-an-order" }),
    })).rejects.toThrow("not-found");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
