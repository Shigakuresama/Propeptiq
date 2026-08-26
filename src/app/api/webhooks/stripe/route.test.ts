import { beforeEach, describe, expect, it, vi } from "vitest";

const { createStripeWebhookServerRuntime, handleDelivery } = vi.hoisted(() => ({
  createStripeWebhookServerRuntime: vi.fn(),
  handleDelivery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/commerce/server-runtime", () => ({ createStripeWebhookServerRuntime }));

import { POST, dynamic, runtime } from "./route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleDelivery.mockResolvedValue({ status: "processed" });
    createStripeWebhookServerRuntime.mockResolvedValue({ handleDelivery });
  });

  it("uses the Node runtime and forwards exact signed bytes once", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    const payload = new Uint8Array([0, 1, 2, 3, 255]);
    const request = new Request("http://127.0.0.1:4631/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=test-signature" },
      body: payload,
    });
    const arrayBuffer = vi.spyOn(request, "arrayBuffer");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(handleDelivery).toHaveBeenCalledOnce();
    expect([...handleDelivery.mock.calls[0]![0].exactPayload]).toEqual([...payload]);
    expect(handleDelivery.mock.calls[0]![0].signature).toBe("t=1,v1=test-signature");
  });

  it("fails closed without a coherent event runtime", async () => {
    createStripeWebhookServerRuntime.mockResolvedValue(null);
    const response = await POST(new Request("http://127.0.0.1:4631/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=test-signature" },
      body: "{}",
    }));
    expect(response.status).toBe(503);
    expect(handleDelivery).not.toHaveBeenCalled();
  });

  it("collapses runtime assembly failures without leaking the error", async () => {
    createStripeWebhookServerRuntime.mockRejectedValue(new Error("sensitive database detail"));
    const request = new Request("http://127.0.0.1:4631/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=test-signature" },
      body: "{}",
    });
    const arrayBuffer = vi.spyOn(request, "arrayBuffer");
    const response = await POST(request);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(arrayBuffer).toHaveBeenCalledOnce();
  });
});
