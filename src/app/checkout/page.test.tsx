import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { parseServerEnv } from "@/config/env-schema";

const syntheticNeonAuth = {
  STORAGE_NEON_AUTH_BASE_URL:
    "https://ep-synthetic.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
  NEON_AUTH_COOKIE_SECRET:
    "synthetic-neon-auth-cookie-secret-at-least-32-characters",
} as const;

const guardedLocalEnvironment = parseServerEnv({
  APP_ENV: "local",
  VERCEL_ENV: "development",
  VERCEL_TARGET_ENV: "development",
  APP_ORIGIN: "http://127.0.0.1:4631",
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "enabled",
  LOCAL_TEST_SECRET: "synthetic-task7-local-driver-secret-0001",
  RATE_LIMIT_SECRET: "synthetic-task7-local-rate-limit-secret-0001",
  AUTH_MODE: "disabled",
  DATABASE_MODE: "disabled",
  PAYMENTS_MODE: "disabled",
  STORAGE_MODE: "disabled",
  EMAIL_MODE: "disabled",
  TAX_MODE: "test",
  SHIPPING_MODE: "test",
  FULFILLMENT_MODE: "test",
  COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
});

const exactPreviewEnvironment = parseServerEnv({
  APP_ENV: "preview",
  VERCEL_ENV: "preview",
  APP_ORIGIN: "https://preview.propeptiq.example.invalid",
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "disabled",
  LOCAL_TEST_SECRET: "",
  AUTH_MODE: "test",
  ...syntheticNeonAuth,
  RATE_LIMIT_SECRET: "synthetic-task7-preview-rate-limit-secret-0001",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL:
    "postgresql://synthetic_task7:synthetic_password@db.example.invalid/propeptiq_task7_test",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
  DATABASE_URL: "",
  DATABASE_MIGRATION_URL: "",
  PAYMENTS_MODE: "test",
  STRIPE_ACCOUNT_ID: "acct_SyntheticTask7Preview",
  STRIPE_SECRET_KEY: "sk_test_synthetic_task7_preview",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic_task7_preview",
  STORAGE_MODE: "disabled",
  EMAIL_MODE: "disabled",
  TAX_MODE: "disabled",
  SHIPPING_MODE: "disabled",
  FULFILLMENT_MODE: "disabled",
  COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
});

const { buyerCheckoutReadyMock, getRequestIdentityMock, getRequestRepositoriesMock, getPublicCatalogMock, redirectMock } = vi.hoisted(
  () => ({
    buyerCheckoutReadyMock: vi.fn(),
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
vi.mock("@/commerce/server-runtime", () => ({
  isBuyerCheckoutRuntimeReady: buyerCheckoutReadyMock,
}));

import CheckoutPage from "./page";

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buyerCheckoutReadyMock.mockReturnValue(false);
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
    buyerCheckoutReadyMock.mockReturnValue(true);
    getRequestIdentityMock.mockResolvedValue({
      environment: guardedLocalEnvironment,
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

  it("renders the exact Preview matrix as browse-only without a checkout form", async () => {
    getRequestIdentityMock.mockResolvedValue({
      environment: exactPreviewEnvironment,
      identity: {
        clerkUserId: "synthetic-preview-buyer",
        primaryEmail: "synthetic-preview-buyer@example.invalid",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: {
        actorId: "50000000-0000-4000-8000-000000000004",
        clerkUserId: "synthetic-preview-buyer",
        buyerStatus: "active",
        capabilities: [],
        mfaSatisfied: false,
      },
      localDriver: null,
    });
    getRequestRepositoriesMock.mockReturnValue({
      loadAccount: async () => ({ status: "active", acceptedAttestationVersion: 1 }),
      loadCurrentAttestation: async () => ({ version: 1, policyText: "Research only." }),
    });

    const markup = renderToStaticMarkup(await CheckoutPage());

    expect(markup).toContain("Browse-only Preview");
    expect(markup).toContain(
      "Shipping, tax, and payment-session creation are unavailable",
    );
    expect(markup).not.toContain("data-testid=\"checkout-form\"");
    expect(markup).not.toContain("Authoritative checkout is available");
  });

  it.each([
    {
      status: "new" as const,
      acceptedAttestationVersion: null,
      expectedGuidance: "Verified account access is unavailable",
    },
    {
      status: "review" as const,
      acceptedAttestationVersion: 1,
      expectedGuidance: "Account review is required",
    },
    {
      status: "blocked" as const,
      acceptedAttestationVersion: 1,
      expectedGuidance: "This buyer account is blocked",
    },
  ])(
    "renders the browse-only Preview notice independently for a $status account",
    async ({ status, acceptedAttestationVersion, expectedGuidance }) => {
      getRequestIdentityMock.mockResolvedValue({
        environment: exactPreviewEnvironment,
        identity: {
          clerkUserId: `synthetic-preview-${status}-buyer`,
          primaryEmail: `synthetic-preview-${status}-buyer@example.invalid`,
          emailVerifiedAt: "2026-08-26T00:00:00.000Z",
          mfaConfigured: false,
          secondFactorCompleted: false,
        },
        principal: {
          actorId: "50000000-0000-4000-8000-000000000004",
          clerkUserId: `synthetic-preview-${status}-buyer`,
          buyerStatus: status,
          capabilities: [],
          mfaSatisfied: false,
        },
        localDriver: null,
      });
      getRequestRepositoriesMock.mockReturnValue({
        loadAccount: async () => ({
          userId: "50000000-0000-4000-8000-000000000004",
          status,
          ageConfirmedAt:
            status === "new" ? null : "2026-08-26T00:00:00.000Z",
          researchPurpose: status === "new" ? null : "analytical",
          organizationName: null,
          acceptedAttestationVersion,
          currentAttestationVersion: 1,
          updatedAt: "2026-08-26T00:00:00.000Z",
        }),
        loadCurrentAttestation: async () => ({
          version: 1,
          policyText: "Research only.",
        }),
      });

      const markup = renderToStaticMarkup(await CheckoutPage());

      expect(markup).toContain(expectedGuidance);
      expect(markup).toContain("Browse-only Preview");
      expect(markup).toContain(
        "Shipping, tax, and payment-session creation are unavailable",
      );
      expect(markup).not.toContain("data-testid=\"checkout-form\"");
      expect(markup).not.toContain("Authoritative checkout is available");
    },
  );

  it("keeps other unavailable environments truthful without Preview claims", async () => {
    getRequestIdentityMock.mockResolvedValue({
      environment: { APP_ENV: "local", DATABASE_MODE: "disabled" },
      identity: {
        clerkUserId: "synthetic-disabled-buyer",
        primaryEmail: "synthetic-disabled-buyer@example.invalid",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: {
        actorId: "50000000-0000-4000-8000-000000000004",
        clerkUserId: "synthetic-disabled-buyer",
        buyerStatus: "active",
        capabilities: [],
        mfaSatisfied: false,
      },
      localDriver: null,
    });
    getRequestRepositoriesMock.mockReturnValue({
      loadAccount: async () => ({ status: "active", acceptedAttestationVersion: 1 }),
      loadCurrentAttestation: async () => ({ version: 1, policyText: "Research only." }),
    });

    const markup = renderToStaticMarkup(await CheckoutPage());

    expect(markup).toContain("Checkout remains unavailable");
    expect(markup).not.toContain("Browse-only Preview");
    expect(markup).not.toContain("data-testid=\"checkout-form\"");
  });
});
