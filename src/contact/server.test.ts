import { describe, expect, it, vi } from "vitest";

import type { ContactDeliveryStore } from "@/db/repositories/contact-delivery-store";
import { createResendContactGateway } from "@/contact/resend-gateway";
import { createContactPostHandler, type ContactServerDependencies } from "@/contact/server";
import type { RuntimeDatabaseSession } from "@/db/runtime";

const requestId = "10000000-0000-4000-8000-000000000001";
const valid = { requestId, name: "Ada", email: "ADA@example.test", subject: "Records", message: "Please send details.", orderReference: "", website: "" };

function harness(options: { count?: number; gateway?: ContactServerDependencies["gateway"]; store?: ContactDeliveryStore } = {}) {
  const gateway = options.gateway ?? { send: vi.fn().mockResolvedValue({ accepted: true, providerId: "email_1" }) };
  const store = options.store ?? { reserve: vi.fn().mockResolvedValue("reserved"), accept: vi.fn().mockResolvedValue(true), reject: vi.fn() };
  const query = vi.fn(async (sql: string) => sql.includes("RETURNING count") ? { rows: [{ count: options.count ?? 1 }] } : { rows: [] });
  const session = {
    query: query as RuntimeDatabaseSession["query"],
    release: vi.fn(),
  } satisfies RuntimeDatabaseSession;
  const handler = createContactPostHandler({
    appEnvironment: "local", appOrigin: "https://store.example.test", connect: async () => session,
    createDeliveryStore: () => store, gateway, now: () => new Date("2026-09-06T12:00:00Z"),
    rateLimit: 3, rateLimitSecret: "synthetic-contact-rate-secret-0123456789ABCDE", rateLimitWindowSeconds: 600,
  });
  const request = (body: unknown = valid, headers: Record<string, string> = {}) => new Request("https://store.example.test/api/contact", {
    method: "POST", headers: { origin: "https://store.example.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  return { handler, request, gateway, store, session };
}

describe("contact POST handler", () => {
  it("fails closed without configuration before reading the body", async () => {
    const request = new Request("https://store.example.test/api/contact", { method: "POST", body: "secret" });
    const result = await createContactPostHandler()(request);
    expect(result.status).toBe(503); expect(request.bodyUsed).toBe(false);
  });

  it("rejects a mismatched or missing exact Origin", async () => {
    const { handler, request } = harness();
    expect((await handler(request(valid, { origin: "https://attacker.example" }))).status).toBe(403);
    const missing = request(); missing.headers.delete("origin");
    expect((await handler(missing)).status).toBe(403);
  });

  it.each([
    ["request", { ...valid, requestId: "not-a-uuid" }],
    ["name", { ...valid, name: "" }], ["email", { ...valid, email: "invalid" }],
    ["subject", { ...valid, subject: "" }], ["message", { ...valid, message: "" }],
  ])("reports invalid %s input", async (field, body) => {
    const { handler, request } = harness(); const result = await handler(request(body));
    expect(result.status).toBe(400); expect(await result.json()).toEqual({ status: "INVALID", field });
  });

  it("bounds the body and does not send", async () => {
    const { handler, request, gateway } = harness(); const result = await handler(request(valid, { "content-length": "70000" }));
    expect(result.status).toBe(413); expect(gateway.send).not.toHaveBeenCalled();
  });

  it("rejects honeypot spam without claiming acceptance or calling the provider", async () => {
    const { handler, request, gateway } = harness(); const result = await handler(request({ ...valid, website: "bot" }));
    expect(result.status).toBe(400); expect(await result.json()).toEqual({ status: "INVALID", field: "request" });
    expect(gateway.send).not.toHaveBeenCalled();
  });

  it("stops reading a chunked body as soon as it exceeds the byte limit", async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40_000));
        if (pulls > 3) controller.close();
      },
    });
    const { handler, gateway } = harness();
    const request = new Request("https://store.example.test/api/contact", {
      method: "POST",
      headers: { origin: "https://store.example.test", "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const result = await handler(request);
    expect(result.status).toBe(413);
    expect(pulls).toBeLessThanOrEqual(3);
    expect(gateway.send).not.toHaveBeenCalled();
  });

  it("enforces the durable rate limit before delivery", async () => {
    const { handler, request, gateway } = harness({ count: 4 }); const result = await handler(request());
    expect(result.status).toBe(429); expect(gateway.send).not.toHaveBeenCalled();
  });

  it("normalizes input and persists provider acceptance before reporting success", async () => {
    const { handler, request, gateway, store } = harness(); const result = await handler(request());
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ status: "ACCEPTED" });
    expect(gateway.send).toHaveBeenCalledWith(expect.objectContaining({ email: "ada@example.test" }), `contact/${requestId}`);
    expect(store.accept).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^[0-9a-f]{64}$/u), "email_1", expect.any(Date));
  });

  it("accepts a maximum-length Unicode message within the byte envelope", async () => {
    const { handler, request, gateway } = harness();
    const result = await handler(request({ ...valid, message: "é".repeat(5_000) }));
    expect(result.status).toBe(200);
    expect(gateway.send).toHaveBeenCalledOnce();
  });

  it("reuses a durable accepted result and does not resend", async () => {
    const store = { reserve: vi.fn().mockResolvedValue("accepted"), accept: vi.fn(), reject: vi.fn() };
    const { handler, request, gateway } = harness({ store }); const result = await handler(request());
    expect(result.status).toBe(200); expect(gateway.send).not.toHaveBeenCalled();
  });

  it("binds a submission UUID to its payload while allowing a new UUID for the same message", async () => {
    const firstStore = { reserve: vi.fn().mockResolvedValue("accepted"), accept: vi.fn(), reject: vi.fn() };
    const first = harness({ store: firstStore });
    expect((await first.handler(first.request())).status).toBe(200);
    expect(firstStore.reserve).toHaveBeenCalledWith(`contact/${requestId}`, expect.stringMatching(/^[0-9a-f]{64}$/u), expect.any(Date));
    expect(first.gateway.send).not.toHaveBeenCalled();

    const secondId = "10000000-0000-4000-8000-000000000002";
    const second = harness();
    expect((await second.handler(second.request({ ...valid, requestId: secondId }))).status).toBe(200);
    expect(second.gateway.send).toHaveBeenCalledWith(expect.any(Object), `contact/${secondId}`);
  });

  it("fails a reused submission UUID whose payload binding conflicts", async () => {
    const store = { reserve: vi.fn().mockResolvedValue("conflict"), accept: vi.fn(), reject: vi.fn() };
    const { handler, request, gateway } = harness({ store });
    expect((await handler(request({ ...valid, subject: "Changed under the same UUID" }))).status).toBe(409);
    expect(gateway.send).not.toHaveBeenCalled();
  });

  it("clears a definitive rejection but retains an ambiguous thrown delivery", async () => {
    const rejected = harness({ gateway: { send: vi.fn().mockResolvedValue({ accepted: false }) } });
    expect((await rejected.handler(rejected.request())).status).toBe(503); expect(rejected.store.reject).toHaveBeenCalledOnce();
    const thrown = harness({ gateway: { send: vi.fn().mockRejectedValue(new Error("private")) } });
    expect((await thrown.handler(thrown.request())).status).toBe(503); expect(thrown.store.reject).not.toHaveBeenCalled();
  });

  it.each([
    ["network", { data: null, error: { name: "application_error", statusCode: null }, headers: null }],
    ["provider 5xx", { data: null, error: { name: "internal_server_error", statusCode: 503 }, headers: null }],
    ["malformed success", { data: {}, error: null, headers: null }],
  ])("retains the pending reservation after an ambiguous resolved SDK %s response", async (_label, providerResponse) => {
    const gateway = createResendContactGateway({
      emails: { send: vi.fn().mockResolvedValue(providerResponse) },
      from: "from@example.test",
      supportRecipient: "support@example.test",
    });
    const test = harness({ gateway });
    expect((await test.handler(test.request())).status).toBe(503);
    expect(test.store.reject).not.toHaveBeenCalled();
    expect(test.store.accept).not.toHaveBeenCalled();
  });
});
