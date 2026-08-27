import { describe, expect, it, vi } from "vitest";

import { createWebhookHttpHandler } from "@/commerce/webhook-http";

const endpoint = "https://example.test/api/webhooks/stripe";

describe("Stripe webhook HTTP controller", () => {
  it("reads exact bytes once and maps safe closed outcomes", async () => {
    const handleDelivery = vi.fn(async () => ({ status: "processed" as const }));
    const handler = createWebhookHttpHandler({ handleDelivery });
    const request = new Request(endpoint, {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=synthetic" },
      body: new Uint8Array([0x7b, 0x7d]),
    });
    const arrayBuffer = vi.spyOn(request, "arrayBuffer");
    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "processed" });
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(handleDelivery).toHaveBeenCalledWith({
      exactPayload: new Uint8Array([0x7b, 0x7d]),
      signature: "t=123,v1=synthetic",
    });
  });

  it.each([
    ["deferred", 202],
    ["conflict", 409],
    ["invalid_delivery", 400],
    ["busy", 503],
    ["lease_lost", 503],
    ["retryable_failure", 503],
    ["unavailable", 503],
  ] as const)("maps %s without provider detail", async (status, expected) => {
    const handler = createWebhookHttpHandler({ handleDelivery: async () => ({ status } as never) });
    const response = await handler(new Request(endpoint, {
      method: "POST",
      headers: { "stripe-signature": "signature" },
      body: "{}",
    }));
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toMatch(/event|payload|signature|customer|payment/iu);
  });

  it("rejects missing signatures and oversized bodies without invoking authority", async () => {
    const handleDelivery = vi.fn();
    const handler = createWebhookHttpHandler({ handleDelivery });
    expect((await handler(new Request(endpoint, { method: "POST", body: "{}" }))).status).toBe(400);
    expect((await handler(new Request(endpoint, {
      method: "POST",
      headers: {
        "stripe-signature": "signature",
        "content-length": String(1024 * 1024 + 1),
      },
      body: "{}",
    }))).status).toBe(400);
    expect(handleDelivery).not.toHaveBeenCalled();
  });
});
