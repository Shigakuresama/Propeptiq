import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const referrals = Object.freeze({
  code: null,
  status: null,
  counts: Object.freeze({ attributed: 4, pending: 2, qualified: 1, reversed: 1 }),
  rewardPointsTotal: 375,
  conversions: Object.freeze({
    items: Object.freeze([Object.freeze({
      reference: "ref:6666666666",
      status: "qualified" as const,
      rewardPoints: 375,
      occurredAt: "2026-08-28T18:00:00.000Z",
    })]),
    totalCount: 1,
    page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
  }),
});

const policy = Object.freeze({
  attributionDays: 30,
  referredDiscountBasisPoints: 1_000,
  referredDiscountCapMinor: 2_500,
  referrerPointsPerDollar: 5,
  referrerRewardCapPoints: 2_500,
});

const terms = Object.freeze({
  id: "75000000-0000-4000-8000-000000000001",
  version: 7,
});

describe("ReferralDashboard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("submits only current terms acceptance and renders redacted owner summary data", async () => {
    const { ReferralDashboard } = await import("./referral-dashboard");
    const action = vi.fn().mockResolvedValue({
      state: "success",
      code: "enrolled",
      referralCode: "ref_StableOwnerCode1234",
    });

    const { container } = render(
      <ReferralDashboard
        referrals={referrals}
        policy={policy}
        terms={terms}
        blocked={false}
        action={action}
      />,
    );

    expect(screen.getByText("ref:6666666666")).toBeVisible();
    expect(screen.getAllByText("375", { selector: "dd" })).toHaveLength(2);
    const form = screen.getByRole("form", { name: "Activate referral code" });
    expect(within(form).getByRole("checkbox", { name: /accept current referral terms version 7/iu }))
      .toHaveAttribute("aria-required", "true");
    expect(container.querySelector('input[name="termsVersionId"]')).toHaveValue(terms.id);
    expect(container.querySelector('input[name="termsContentHash"]')).toBeNull();
    expect(container.querySelector('input[name="ownerUserId"]')).toBeNull();
    expect(container.querySelector('input[name*="rate" i], input[name*="points" i], input[name*="discount" i]')).toBeNull();
  });

  it("focuses activation errors and announces stable-code copy success politely", async () => {
    const { ReferralDashboard } = await import("./referral-dashboard");
    const user = userEvent.setup();
    const errorAction = vi.fn().mockResolvedValue({
      state: "error",
      code: "unavailable",
      referralCode: null,
    });
    const { unmount } = render(
      <ReferralDashboard
        referrals={referrals}
        policy={policy}
        terms={terms}
        blocked={false}
        action={errorAction}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /accept current referral terms/iu }));
    await user.click(screen.getByRole("button", { name: "Activate referral code" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByText(/could not be activated safely/iu)).toBeVisible();
    unmount();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const successAction = vi.fn().mockResolvedValue({
      state: "success",
      code: "idempotent",
      referralCode: "ref_StableOwnerCode1234",
    });
    render(
      <ReferralDashboard
        referrals={referrals}
        policy={policy}
        terms={terms}
        blocked={false}
        action={successAction}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /accept current referral terms/iu }));
    await user.click(screen.getByRole("button", { name: "Activate referral code" }));
    await user.click(await screen.findByRole("button", { name: "Copy referral link" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/r\/ref_StableOwnerCode1234$/u));
    expect(screen.getByRole("status")).toHaveTextContent("Referral link copied.");
  });
});
