import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
  createRuntime: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  submitRefund: vi.fn(),
  clearHold: vi.fn(),
  handoff: vi.fn(),
  deliver: vi.fn(),
  exception: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  getRequestRepositories: mocks.getRequestRepositories,
  loadTargetVerifiedIdentity: vi.fn(),
}));
vi.mock("@/commerce/server-runtime", () => ({
  createStaffCommerceServerRuntime: mocks.createRuntime,
}));

import {
  clearFulfillmentHoldAction,
  handoffFulfillmentAction,
  markShipmentDeliveredAction,
  recordShipmentExceptionAction,
  submitOrRecoverRefundAction,
} from "./actions";

const refundId = "68000000-0000-4000-8000-000000000002";
const orderId = "68000000-0000-4000-8000-000000000001";

function data(name: "refundId" | "orderId", id: string): FormData {
  const form = new FormData();
  form.set(name, id);
  form.set("amountMinor", "99999999");
  form.set("releaseId", "browser-must-not-own-this");
  form.set("reason", "browser-must-not-own-this");
  form.set("timestamp", "1900-01-01T00:00:00.000Z");
  return form;
}

describe("Slice 6G staff commerce server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const request = {
      environment: {
        RATE_LIMIT_SECRET: "commerce-action-rate-secret-at-least-32-characters",
      },
      identity: {
        clerkUserId: "clerk_admin",
        primaryEmail: "admin@example.test",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: true,
        secondFactorCompleted: true,
      },
      principal: {
        actorId: "50000000-0000-4000-8000-000000000003",
        clerkUserId: "clerk_admin",
        buyerStatus: "active",
        mfaSatisfied: true,
        capabilities: ["order:read:any", "refund:request", "fulfillment:release:consume"],
      },
      localDriver: {},
    };
    mocks.getRequestIdentity.mockResolvedValue(request);
    mocks.getRequestRepositories.mockReturnValue({ adminRepository: {}, storageVerifier: {} });
    mocks.submitRefund.mockResolvedValue({ status: "awaiting_signed_event" });
    mocks.clearHold.mockResolvedValue({ status: "cleared" });
    mocks.handoff.mockResolvedValue({ status: "handed_off" });
    mocks.deliver.mockResolvedValue({ status: "already_delivered" });
    mocks.exception.mockResolvedValue({ status: "exception" });
    mocks.createRuntime.mockResolvedValue({
      submitOrRecoverRefund: mocks.submitRefund,
      clearFulfillmentHold: mocks.clearHold,
      handoffFulfillment: mocks.handoff,
      markShipmentDelivered: mocks.deliver,
      recordShipmentException: mocks.exception,
    });
  });

  it("mints staff context server-side and forwards only the exact refund UUID", async () => {
    await expect(submitOrRecoverRefundAction(data("refundId", refundId))).rejects.toThrow(
      `redirect:/admin/refunds?command=submit-refund&target=${refundId}&result=awaiting_signed_event`,
    );
    expect(mocks.createRuntime).toHaveBeenCalledOnce();
    expect(mocks.submitRefund).toHaveBeenCalledWith(refundId);
    expect(mocks.submitRefund.mock.calls[0]).toHaveLength(1);
  });

  it("routes each fulfillment action to its distinct UUID-only command", async () => {
    const matrix = [
      [clearFulfillmentHoldAction, mocks.clearHold, "clear-hold", "cleared", "orders"],
      [handoffFulfillmentAction, mocks.handoff, "handoff", "handed_off", "shipments"],
      [markShipmentDeliveredAction, mocks.deliver, "deliver", "already_delivered", "shipments"],
      [recordShipmentExceptionAction, mocks.exception, "exception", "exception", "shipments"],
    ] as const;
    for (const [action, method, command, result, resource] of matrix) {
      await expect(action(data("orderId", orderId))).rejects.toThrow(
        `redirect:/admin/${resource}?command=${command}&target=${orderId}&result=${result}`,
      );
      expect(method).toHaveBeenLastCalledWith(orderId);
      expect(method.mock.calls.at(-1)).toHaveLength(1);
    }
  });

  it("rejects malformed IDs before identity, runtime, repository, or provider work", async () => {
    await expect(handoffFulfillmentAction(data("orderId", "not-a-uuid"))).rejects.toThrow(
      "redirect:/admin/shipments?command=handoff&result=unavailable",
    );
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.handoff).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", new FormData()],
    ["non-text", (() => {
      const form = new FormData();
      form.set("orderId", new Blob(["not-authority"]));
      return form;
    })()],
  ])("bounds a %s UUID field to the same safe redirect", async (_label, formData) => {
    await expect(handoffFulfillmentAction(formData)).rejects.toThrow(
      "redirect:/admin/shipments?command=handoff&result=unavailable",
    );
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.handoff).not.toHaveBeenCalled();
  });
});
