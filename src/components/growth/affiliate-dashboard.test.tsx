import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const policy = Object.freeze({
  attributionDays: 30,
  reorderWindowDays: 180,
  approvalDelayDays: 30,
  payoutThresholdMinor: 5_000,
  currency: "USD",
});
const terms = Object.freeze({
  id: "78000000-0000-4000-8000-000000000001",
  version: 5,
});
const profile = Object.freeze({
  publicCode: "aff_StablePrivateCode1234",
  status: "suspended" as const,
  publicChannel: "https://example.test/research-records",
  promotionMethod: "website" as const,
  attributedCount: 8,
  commissionTotalsMinor: Object.freeze({ pending: 1_250, approved: 2_500, paid: 7_500, reversed: 500 }),
  payoutTotalsMinor: Object.freeze({ pending: 2_500, paid: 7_500 }),
});

describe("AffiliateDashboard", () => {
  it("inherits verified email and submits only bounded channel, method, and terms identifier", async () => {
    const { AffiliateDashboard } = await import("./affiliate-dashboard");
    const action = vi.fn();
    const { container } = render(
      <AffiliateDashboard
        affiliate={null}
        policy={policy}
        terms={terms}
        verifiedEmail="owner@example.test"
        blocked={false}
        action={action}
      />,
    );

    const form = screen.getByRole("form", { name: "Apply for partner program" });
    expect(within(form).getByLabelText("Verified email")).toHaveValue("owner@example.test");
    expect(within(form).getByLabelText("Verified email")).not.toHaveAttribute("name");
    expect(within(form).getByLabelText("Public channel URL or handle")).toHaveAttribute("maxlength", "200");
    expect(within(form).getByLabelText("Public channel URL or handle")).toHaveAttribute("aria-required", "true");
    expect(within(form).getByLabelText("Promotion method")).toHaveAttribute("aria-required", "true");
    expect(within(form).getByRole("checkbox", { name: /accept current partner terms version 5/iu })).toHaveAttribute("aria-required", "true");
    expect(container.querySelector('input[name="termsVersionId"]')).toHaveValue(terms.id);
    expect(container.querySelector('input[name="termsContentHash"], input[name="email"], input[name="role"], input[name*="commission" i], input[name*="payout" i]')).toBeNull();
    expect(container.querySelector("textarea, input[type='file']")).toBeNull();
  });

  it("renders suspended private financial history with text and icon state but no send-money control", async () => {
    const { AffiliateDashboard } = await import("./affiliate-dashboard");
    render(
      <AffiliateDashboard
        affiliate={profile}
        policy={policy}
        terms={terms}
        verifiedEmail="owner@example.test"
        blocked={false}
        action={vi.fn()}
      />,
    );

    expect(screen.getByText("Suspended")).toBeVisible();
    expect(screen.getByText("$12.50")).toBeVisible();
    expect(screen.getAllByText("$75.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/history remains readable/iu)).toBeVisible();
    expect(screen.queryByRole("button", { name: /send|pay|payout|transfer/iu })).toBeNull();
  });

  it("focuses application errors and announces success politely", async () => {
    const { AffiliateDashboard } = await import("./affiliate-dashboard");
    const user = userEvent.setup();
    const errorAction = vi.fn().mockResolvedValue({ state: "error", code: "invalid", application: null });
    const { unmount } = render(
      <AffiliateDashboard affiliate={null} policy={policy} terms={terms} verifiedEmail="owner@example.test" blocked={false} action={errorAction} />,
    );
    await user.type(screen.getByLabelText("Public channel URL or handle"), "@research_records");
    await user.selectOptions(screen.getByLabelText("Promotion method"), "social");
    await user.click(screen.getByRole("checkbox", { name: /accept current partner terms/iu }));
    await user.click(screen.getByRole("button", { name: "Submit partner application" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(within(alert).getByRole("link", { name: "Public channel" })).toHaveAttribute("href", "#partner-public-channel");
    expect(within(alert).getByRole("link", { name: "Promotion method" })).toHaveAttribute("href", "#partner-promotion-method");
    expect(within(alert).getByRole("link", { name: "Current terms" })).toHaveAttribute("href", "#partner-terms-acceptance");
    expect(screen.getByLabelText("Public channel URL or handle")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Public channel URL or handle")).toHaveAttribute(
      "aria-describedby",
      "partner-channel-help partner-channel-error",
    );
    expect(screen.getByLabelText("Promotion method")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Promotion method")).toHaveAttribute("aria-describedby", "partner-method-error");
    expect(screen.getByRole("checkbox", { name: /accept current partner terms/iu })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("checkbox", { name: /accept current partner terms/iu })).toHaveAttribute("aria-describedby", "partner-terms-error");
    expect(screen.getByText("Review this bounded public channel.")).toBeVisible();
    expect(screen.getByText("Select the applicable promotion method.")).toBeVisible();
    expect(screen.getByText("Accept the exact current partner terms.")).toBeVisible();
    unmount();

    const successAction = vi.fn().mockResolvedValue({
      state: "success",
      code: "submitted",
      application: Object.freeze({
        publicCode: "aff_StablePrivateCode1234",
        status: "pending",
        version: 1,
        publicChannel: "@research_records",
        promotionMethod: "social",
        createdAt: "2026-08-28T18:00:00.000Z",
      }),
    });
    render(
      <AffiliateDashboard affiliate={null} policy={policy} terms={terms} verifiedEmail="owner@example.test" blocked={false} action={successAction} />,
    );
    await user.type(screen.getByLabelText("Public channel URL or handle"), "@research_records");
    await user.selectOptions(screen.getByLabelText("Promotion method"), "social");
    await user.click(screen.getByRole("checkbox", { name: /accept current partner terms/iu }));
    await user.click(screen.getByRole("button", { name: "Submit partner application" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Partner application submitted.");
    expect(screen.getByText("Pending")).toBeVisible();
  });
});
