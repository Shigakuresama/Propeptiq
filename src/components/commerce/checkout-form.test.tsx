import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock, navigate } = vi.hoisted(() => ({
  useCart: vi.fn(),
  fetchMock: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/cart/cart-provider", () => ({ useCart }));

import { CheckoutForm } from "./checkout-form";

const firstKey = "7a000000-0000-4000-8000-000000000001";
const secondKey = "7a000000-0000-4000-8000-000000000002";
const orderId = "71000000-0000-4000-8000-000000000001";
const productId = "61000000-0000-4000-8000-000000000001";

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function preview(overrides: Record<string, unknown> = {}) {
  return {
    items: [{
      productId,
      quantity: 2,
      available: true,
      name: "Synthetic local test only — Alpha",
      packageForm: "Research vial",
      unitAmountMinor: 2_400,
      lineSubtotalMinor: 4_800,
      currency: "USD",
    }],
    subtotalMinor: 4_800,
    currency: "USD",
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken: "c".repeat(64),
    requiresAcknowledgement: false,
    reasons: [],
    ...overrides,
  };
}

async function completeDestination(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Recipient name"), "Synthetic Research Buyer");
  await user.type(screen.getByLabelText("Address line 1"), "100 Test Way");
  await user.type(screen.getByLabelText("City"), "Los Angeles");
  await user.selectOptions(screen.getByLabelText("State or district"), "CA");
  await user.type(screen.getByLabelText("Postal code"), "90001");
  await user.selectOptions(screen.getByLabelText("Promotion (optional)"), "66000000-0000-4000-8000-000000000001");
}

describe("CheckoutForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fetchMock.mockReset();
    useCart.mockReturnValue({
      hydrated: true,
      items: [{ productId, quantity: 2 }],
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      throw new Error(`Unexpected test request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce(firstKey)
      .mockReturnValueOnce(secondKey);
  });

  it("labels the synthetic surface and exposes required destination semantics", async () => {
    render(<CheckoutForm promotions={[]} syntheticLocal navigate={navigate} />);

    expect(await screen.findByText("Synthetic local test only", { selector: "p" })).toBeVisible();
    for (const name of ["Recipient name", "Address line 1", "City", "State or district", "Postal code"]) {
      const field = screen.getByLabelText(name);
      expect(field).toBeRequired();
      expect(field).toHaveAttribute("aria-required", "true");
    }
  });

  it("uses one exact request/key for authoritative quote and hosted session", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url === "/api/checkout/quote") return response({
        status: "quoted",
        quote: {
          status: "ready", reviewRequired: false, reasons: [], currency: "USD",
          subtotalMinor: 4_800, discountMinor: 480, shippingMinor: 500, taxMinor: 321, totalMinor: 5_141,
          promotionDiscountMinor: 480, referralDiscountMinor: 0,
          rewardRedemptionPoints: 0, rewardRedemptionMinor: 0,
          pendingBaseEarnPoints: 86, rewardsBenefitAvailable: true, rewardsUnavailableReason: null,
          lines: [{
            productId: "61000000-0000-4000-8000-000000000001", productName: "Synthetic local test only — Alpha",
            packageForm: "Research vial", quantity: 2, unitAmountMinor: 2_400, subtotalMinor: 4_800,
            discountMinor: 480, totalMinor: 4_320,
          }],
        },
      });
      if (url === "/api/checkout/sessions") return response({
        status: "open", orderId,
        hostedUrl: "http://127.0.0.1:4631/__synthetic_local_checkout/cs_local_synthetic_71000000000040008000000000000001",
        expiresAt: "2026-08-26T21:30:00.000Z",
      });
      throw new Error(`Unexpected test request: ${url}`);
    });

    render(<CheckoutForm promotions={[{
      id: "66000000-0000-4000-8000-000000000001",
      name: "Synthetic local test only — 10%",
    }]} navigate={navigate} />);
    await completeDestination(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    expect(await screen.findByText("$51.41")).toBeVisible();
    expect(screen.getByText("−$4.80")).toBeVisible();
    expect(screen.getByText("$5.00")).toBeVisible();
    expect(screen.getByText("$3.21")).toBeVisible();
    const firstCall = fetchMock.mock.calls.find(([url]) => url === "/api/checkout/quote")!;
    expect(firstCall[0]).toBe("/api/checkout/quote");
    const init = firstCall[1] as RequestInit;
    expect(new Headers(init.headers).get("idempotency-key")).toBe(firstKey);
    const requestBody = JSON.parse(String(init.body));
    expect(Object.keys(requestBody).sort()).toEqual(["destination", "items", "promotionIds"]);
    const browserKeys = [
      ...Object.keys(requestBody),
      ...Object.keys(requestBody.destination),
      ...Object.keys(requestBody.items[0]),
    ];
    expect(browserKeys).not.toEqual(expect.arrayContaining([
      "total", "currency", "buyerId", "customerId", "providerPriceId",
      "metadata", "successUrl", "cancelUrl",
    ]));

    await user.click(screen.getByRole("button", { name: "Continue to hosted payment" }));
    const secondInit = fetchMock.mock.calls.find(([url]) => url === "/api/checkout/sessions")![1] as RequestInit;
    expect(new Headers(secondInit.headers).get("idempotency-key")).toBe(firstKey);
    expect(secondInit.body).toBe(init.body);
    expect(navigate).toHaveBeenCalledWith(
      "http://127.0.0.1:4631/__synthetic_local_checkout/cs_local_synthetic_71000000000040008000000000000001",
    );
  });

  it("sends only valid requested points with the existing origin and idempotency paths", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url === "/api/checkout/quote") {
        return response({ status: "quote_unavailable", component: "commerce" }, 503);
      }
      throw new Error(`Unexpected test request: ${url}`);
    });

    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    const points = screen.getByLabelText("Points to redeem (optional)");
    expect(points).not.toBeRequired();
    expect(points).toHaveAttribute("type", "number");
    expect(points).toHaveAttribute("min", "1");
    expect(points).toHaveAttribute("max", String(Number.MAX_SAFE_INTEGER));
    expect(points).toHaveAttribute("step", "1");
    expect(screen.queryByText(/points pending after qualifying payment/i)).toBeNull();

    await user.type(points, "500");
    await completeDestinationWithoutPromotion(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    const quoteCall = fetchMock.mock.calls.find(([url]) => url === "/api/checkout/quote")!;
    const init = quoteCall[1] as RequestInit;
    expect(new Headers(init.headers).get("idempotency-key")).toBe(firstKey);
    const requestBody = JSON.parse(String(init.body));
    expect(Object.keys(requestBody).sort()).toEqual([
      "destination", "items", "promotionIds", "rewardRedemptionPoints",
    ]);
    expect(requestBody.rewardRedemptionPoints).toBe(500);
    expect(requestBody).not.toEqual(expect.objectContaining({
      rewardBalancePoints: expect.anything(),
      rewardRedemptionRate: expect.anything(),
      rewardRedemptionMinor: expect.anything(),
      rewardPolicyHash: expect.anything(),
    }));
  });

  it.each(["0", "1.5", "9007199254740992"])(
    "does not send invalid requested points %s",
    async (requestedPoints) => {
      const user = userEvent.setup();
      render(<CheckoutForm promotions={[]} navigate={navigate} />);
      await completeDestinationWithoutPromotion(user);
      await user.type(screen.getByLabelText("Points to redeem (optional)"), requestedPoints);
      const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
      await waitFor(() => expect(quoteButton).toBeEnabled());
      await user.click(quoteButton);

      expect(await screen.findAllByText("Enter a positive whole number of points")).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/quote")).toHaveLength(0);
    },
  );

  it("renders the complete authoritative growth breakdown as distinct rows", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url !== "/api/checkout/quote") throw new Error(`Unexpected test request: ${url}`);
      return response({
        status: "quoted",
        quote: {
          status: "ready", reviewRequired: false, reasons: [], currency: "USD",
          subtotalMinor: 4_800, discountMinor: 1_080, shippingMinor: 500, taxMinor: 321, totalMinor: 4_541,
          promotionDiscountMinor: 300, referralDiscountMinor: 180,
          rewardRedemptionPoints: 600, rewardRedemptionMinor: 600,
          pendingBaseEarnPoints: 74, rewardsBenefitAvailable: true, rewardsUnavailableReason: null,
          lines: [{
            productId, productName: "Synthetic local test only — Alpha", packageForm: "Research vial",
            quantity: 2, unitAmountMinor: 2_400, subtotalMinor: 4_800,
            discountMinor: 1_080, totalMinor: 3_720,
          }],
        },
      });
    });

    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    await completeDestinationWithoutPromotion(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    const summary = await screen.findByRole("heading", { name: "Authoritative total" });
    const rows = summary.parentElement!;
    expect(within(rows).getByText("Merchandise subtotal")).toBeVisible();
    expect(within(rows).getByText("Promotion discount")).toBeVisible();
    expect(within(rows).getByText("Referral benefit")).toBeVisible();
    expect(within(rows).getByText("Points redemption (600 points)")).toBeVisible();
    expect(within(rows).getByText("Shipping")).toBeVisible();
    expect(within(rows).getByText("Tax")).toBeVisible();
    expect(within(rows).getByText("Total")).toBeVisible();
    expect(within(rows).getByText("Research vial · 2 × $24.00")).toHaveClass("text-base");
    expect(within(rows).getByText("74 points pending after qualifying payment")).toHaveClass("text-base");
    expect(screen.getByText("Authoritative total ready. Review it before continuing to hosted payment."))
      .toHaveClass("text-base");
  });

  it.each([
    ["partial acquisition", {
      promotionDiscountMinor: 300,
    }],
    ["partial rewards", {
      promotionDiscountMinor: 480,
      referralDiscountMinor: 600,
      rewardRedemptionPoints: 600,
      rewardRedemptionMinor: 600,
      pendingBaseEarnPoints: 74,
      rewardsBenefitAvailable: true,
    }],
    ["complete rewards without acquisition", {
      rewardRedemptionPoints: 1_080,
      rewardRedemptionMinor: 1_080,
      pendingBaseEarnPoints: 74,
      rewardsBenefitAvailable: true,
      rewardsUnavailableReason: null,
    }],
    ["missing authoritative breakdown", {}],
    ["arithmetic mismatch", {
      promotionDiscountMinor: 300,
      referralDiscountMinor: 180,
      rewardRedemptionPoints: 600,
      rewardRedemptionMinor: 599,
      pendingBaseEarnPoints: 74,
      rewardsBenefitAvailable: true,
      rewardsUnavailableReason: null,
    }],
  ])("rejects a %s authoritative growth response group", async (_label, growth) => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url !== "/api/checkout/quote") throw new Error(`Unexpected test request: ${url}`);
      return response({
        status: "quoted",
        quote: {
          status: "ready", reviewRequired: false, reasons: [], currency: "USD",
          subtotalMinor: 4_800, discountMinor: 1_080, shippingMinor: 500, taxMinor: 321, totalMinor: 4_541,
          ...growth,
          lines: [{
            productId, productName: "Synthetic local test only — Alpha", packageForm: "Research vial",
            quantity: 2, unitAmountMinor: 2_400, subtotalMinor: 4_800,
            discountMinor: 1_080, totalMinor: 3_720,
          }],
        },
      });
    });

    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    await completeDestinationWithoutPromotion(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    expect(await screen.findByText(/checkout is temporarily unavailable/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Authoritative total" })).toBeNull();
  });

  it.each([
    ["not_requested", null],
    ["rewards_policy_inactive", "Rewards benefit unavailable: Rewards are currently unavailable."],
  ] as const)(
    "keeps zero-value growth rows distinct and safely presents rewards reason %s",
    async (rewardsUnavailableReason, expectedWarning) => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url !== "/api/checkout/quote") throw new Error(`Unexpected test request: ${url}`);
      return response({
        status: "quoted",
        quote: {
          status: "ready", reviewRequired: false, reasons: [], currency: "USD",
          subtotalMinor: 4_800, discountMinor: 0, shippingMinor: 500, taxMinor: 321, totalMinor: 5_621,
          promotionDiscountMinor: 0, referralDiscountMinor: 0,
          rewardRedemptionPoints: 0, rewardRedemptionMinor: 0,
          pendingBaseEarnPoints: 0, rewardsBenefitAvailable: false,
          rewardsUnavailableReason,
          lines: [{
            productId, productName: "Synthetic local test only — Alpha", packageForm: "Research vial",
            quantity: 2, unitAmountMinor: 2_400, subtotalMinor: 4_800,
            discountMinor: 0, totalMinor: 4_800,
          }],
        },
      });
    });

    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    await completeDestinationWithoutPromotion(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    const summary = (await screen.findByRole("heading", { name: "Authoritative total" })).parentElement!;
    expect(within(summary).getByText("Promotion discount")).toBeVisible();
    expect(within(summary).getByText("Referral benefit")).toBeVisible();
    expect(within(summary).getByText("Points redemption (0 points)")).toBeVisible();
    expect(within(summary).getByText("0 points pending after qualifying payment")).toBeVisible();
    expect(within(summary).queryByText(rewardsUnavailableReason, { exact: false })).toBeNull();
    if (expectedWarning === null) {
      expect(within(summary).queryByText(/Rewards benefit unavailable:/i)).toBeNull();
    } else {
      expect(within(summary).getByText(expectedWarning)).toHaveClass("text-base");
    }
  });

  it("invalidates the quote and rotates the key after a request edit", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url !== "/api/checkout/quote") throw new Error(`Unexpected test request: ${url}`);
      return response({
      status: "review_required",
      quote: {
        status: "review_required", reviewRequired: true, reasons: ["destination_review"], currency: "USD",
        subtotalMinor: 4_800, discountMinor: 480, shippingMinor: 500, taxMinor: 321, totalMinor: 5_141,
        promotionDiscountMinor: 480, referralDiscountMinor: 0,
        rewardRedemptionPoints: 0, rewardRedemptionMinor: 0,
        pendingBaseEarnPoints: 86, rewardsBenefitAvailable: true, rewardsUnavailableReason: null,
        lines: [{
          productId: "61000000-0000-4000-8000-000000000001", productName: "Synthetic local test only — Alpha",
          packageForm: "Research vial", quantity: 2, unitAmountMinor: 2_400, subtotalMinor: 4_800,
          discountMinor: 480, totalMinor: 4_320,
        }],
      },
      });
    });
    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    await completeDestinationWithoutPromotion(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);
    expect(await screen.findByText("Manual review is required")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue to hosted payment" })).toBeNull();

    await user.clear(screen.getByLabelText("City"));
    await user.type(screen.getByLabelText("City"), "Portland");
    expect(screen.queryByText("$51.41")).toBeNull();
    await user.click(quoteButton);
    const quoteCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/quote");
    await waitFor(() => expect(quoteCalls).toHaveLength(2));
    expect(new Headers((quoteCalls[0]![1] as RequestInit).headers).get("idempotency-key")).toBe(firstKey);
    expect(new Headers((quoteCalls[1]![1] as RequestInit).headers).get("idempotency-key")).toBe(secondKey);
  });

  it("focuses an error summary and links persistent inline errors", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole("link", { name: "Enter a recipient name" })).toHaveAttribute("href", "#recipientName");
    expect(screen.getByLabelText("Recipient name")).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("recipientName-error")).toHaveClass("text-base");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/quote")).toHaveLength(0);
  });

  it("requires explicit acknowledgement when the retained server preview changes", async () => {
    window.sessionStorage.setItem("propeptiq.cart-preview.presentation.v1", JSON.stringify({
      schemaVersion: 1,
      preview: {
        items: [{
          productId: "61000000-0000-4000-8000-000000000001", quantity: 2,
          available: true, name: "Prior Alpha", packageForm: "Research vial",
          unitAmountMinor: 2300, lineSubtotalMinor: 4600, currency: "USD",
        }],
        subtotalMinor: 4600, currency: "USD", taxMinor: null, shippingMinor: null,
        finalDiscountMinor: null, previewToken: "a".repeat(64),
        requiresAcknowledgement: false, reasons: [],
      },
    }));
    fetchMock.mockResolvedValue(response({
      items: [{
        productId: "61000000-0000-4000-8000-000000000001", quantity: 2,
        available: true, name: "Current Alpha", packageForm: "Research vial",
        unitAmountMinor: 2400, lineSubtotalMinor: 4800, currency: "USD",
      }],
      subtotalMinor: 4800, currency: "USD", taxMinor: null, shippingMinor: null,
      finalDiscountMinor: null, previewToken: "b".repeat(64),
      requiresAcknowledgement: true, reasons: ["server_facts_changed"],
    }));
    const user = userEvent.setup();
    render(<CheckoutForm promotions={[]} navigate={navigate} />);

    expect(await screen.findByText(/server preview changed/i)).toBeVisible();
    const previewInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(previewInit.body))).toEqual({
      items: [{ productId: "61000000-0000-4000-8000-000000000001", quantity: 2 }],
      previousPreviewToken: "a".repeat(64),
    });
    expect(screen.getByRole("button", { name: "Get authoritative quote" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Acknowledge current server facts" }));
    expect(screen.getByRole("button", { name: "Get authoritative quote" })).toBeEnabled();
    expect(JSON.parse(window.sessionStorage.getItem("propeptiq.cart-preview.presentation.v1")!))
      .toMatchObject({ preview: { previewToken: "b".repeat(64) } });
  });

  it("offers a uniquely labeled retry that retains fields and the unchanged idempotency key", async () => {
    let quoteAttempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/catalog/preview") return response(preview());
      if (url !== "/api/checkout/quote") throw new Error(`Unexpected test request: ${url}`);
      quoteAttempts += 1;
      if (quoteAttempts === 1) return response({ status: "quote_unavailable", component: "shipping" }, 503);
      return response({
        status: "quoted",
        quote: {
          status: "ready", reviewRequired: false, reasons: [], currency: "USD",
          subtotalMinor: 4_800, discountMinor: 0, shippingMinor: 500, taxMinor: 321, totalMinor: 5_621,
          promotionDiscountMinor: 0, referralDiscountMinor: 0,
          rewardRedemptionPoints: 0, rewardRedemptionMinor: 0,
          pendingBaseEarnPoints: 96, rewardsBenefitAvailable: true, rewardsUnavailableReason: null,
          lines: [{
            productId, productName: "Synthetic local test only — Alpha", packageForm: "Research vial",
            quantity: 2, unitAmountMinor: 2_400, subtotalMinor: 4_800, discountMinor: 0, totalMinor: 4_800,
          }],
        },
      });
    });
    const user = userEvent.setup();
    render(<CheckoutForm promotions={[]} navigate={navigate} />);
    await completeDestinationWithoutPromotion(user);
    const quoteButton = screen.getByRole("button", { name: "Get authoritative quote" });
    await waitFor(() => expect(quoteButton).toBeEnabled());
    await user.click(quoteButton);

    expect(await screen.findByText(/shipping facts are temporarily unavailable/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try authoritative quote again" }));
    expect(await screen.findByText("$56.21")).toBeVisible();
    expect(screen.getByLabelText("City")).toHaveValue("Los Angeles");
    const quoteCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/quote");
    expect(quoteCalls).toHaveLength(2);
    expect(new Headers((quoteCalls[0]![1] as RequestInit).headers).get("idempotency-key")).toBe(firstKey);
    expect(new Headers((quoteCalls[1]![1] as RequestInit).headers).get("idempotency-key")).toBe(firstKey);
  });
});

async function completeDestinationWithoutPromotion(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Recipient name"), "Synthetic Research Buyer");
  await user.type(screen.getByLabelText("Address line 1"), "100 Test Way");
  await user.type(screen.getByLabelText("City"), "Los Angeles");
  await user.selectOptions(screen.getByLabelText("State or district"), "OR");
  await user.type(screen.getByLabelText("Postal code"), "97201");
}
