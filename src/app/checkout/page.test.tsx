import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getRequestIdentityMock, getRequestRepositoriesMock, getPublicCatalogMock, redirectMock } = vi.hoisted(
  () => ({
    getRequestIdentityMock: vi.fn(),
    getRequestRepositoriesMock: vi.fn(),
    getPublicCatalogMock: vi.fn(),
    redirectMock: vi.fn((destination: string) => {
      throw new Error(`redirect:${destination}`);
    }),
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/checkout",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/catalog/server", () => ({ getPublicCatalog: getPublicCatalogMock }));
vi.mock("@/components/commerce/checkout-form", () => ({
  CheckoutForm: ({ promotions, syntheticLocal }: { promotions: readonly { name: string }[]; syntheticLocal: boolean }) => (
    <section data-testid="checkout-form" data-synthetic-local={String(syntheticLocal)}>{promotions.map((promotion) => promotion.name).join(",")}</section>
  ),
}));
vi.mock("@/components/account/checkout-cart-status", () => ({
  CheckoutCartStatus: () => <aside>Saved cart</aside>,
}));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: getRequestIdentityMock,
  getRequestRepositories: getRequestRepositoriesMock,
}));

import CheckoutPage from "./page";

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentityMock.mockResolvedValue({
      environment: { DATABASE_MODE: "disabled" },
      identity: null,
      principal: null,
      localDriver: null,
    });
    getRequestRepositoriesMock.mockReturnValue(null);
  });

  it("redirects signed-out checkout requests to sign-in", async () => {
    await expect(CheckoutPage()).rejects.toThrow("redirect:/sign-in/");
    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/sign-in/");
  });

  it("renders the checkout form only after the active account and attestation gate", async () => {
    getRequestIdentityMock.mockResolvedValue({
      environment: { DATABASE_MODE: "disabled" },
      identity: {
        clerkUserId: "local-customer",
        primaryEmail: "buyer@example.test",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: {
        actorId: "50000000-0000-4000-8000-000000000004",
        clerkUserId: "local-customer",
        buyerStatus: "active",
        capabilities: [],
        mfaSatisfied: false,
      },
      localDriver: {},
    });
    getRequestRepositoriesMock.mockReturnValue({
      loadAccount: async () => ({ status: "active", acceptedAttestationVersion: 1 }),
      loadCurrentAttestation: async () => ({ version: 1, policyText: "Research only." }),
    });
    getPublicCatalogMock.mockResolvedValue({
      promotions: [
        { id: "66000000-0000-4000-8000-000000000001", kind: "discount", name: "Current discount" },
        { id: "66000000-0000-4000-8000-000000000002", kind: "bundle", name: "Display bundle" },
      ],
    });

    const markup = renderToStaticMarkup(await CheckoutPage());
    expect(markup).toContain("Authoritative checkout is available");
    expect(markup).toContain("data-testid=\"checkout-form\"");
    expect(markup).toContain("data-synthetic-local=\"true\"");
    expect(markup).toContain("Current discount");
    expect(markup).not.toContain("Display bundle");
  });
});
