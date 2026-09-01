import { describe, expect, it, vi } from "vitest";

import {
  parseNewsletterResult,
  parseNewsletterSubscriptionInput,
} from "@/newsletter/contracts";
import {
  createNewsletterPostHandler,
  type NewsletterAttemptGate,
  type NewsletterGateway,
} from "@/newsletter/server";
import {
  newsletterConfiguration,
  newsletterPrivacyDestinations,
  projectApprovedNewsletterPrivacyHref,
} from "@/lib/site-content";

const requestUrl = "https://store.example.test/api/newsletter";
const requestOrigin = "https://store.example.test";
const fictionalEmail = "researcher@example.test";
const fictionalPrivacyDestinations = Object.freeze([
  "/test-only-fictional-privacy",
] as const);
const fictionalPrivacyHref = projectApprovedNewsletterPrivacyHref(
  "/test-only-fictional-privacy",
  fictionalPrivacyDestinations,
)!;

function newsletterRequest({
  body = JSON.stringify({ email: fictionalEmail, consent: true }),
  contentLength,
  contentType = "application/json",
  origin = requestOrigin,
}: {
  body?: string;
  contentLength?: string | undefined;
  contentType?: string | null;
  origin?: string | null;
} = {}): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("Origin", origin);
  if (contentType !== null) headers.set("Content-Type", contentType);
  if (contentLength !== undefined) headers.set("Content-Length", contentLength);
  return new Request(requestUrl, { method: "POST", headers, body });
}

function configuredRuntime({
  decision = "allowed",
  gatewayResult = "subscribed",
}: {
  decision?: "allowed" | "limited" | "unavailable";
  gatewayResult?: "subscribed" | "duplicate";
} = {}) {
  const consume = vi.fn<NewsletterAttemptGate["consume"]>().mockResolvedValue(decision);
  const subscribe = vi.fn<NewsletterGateway["subscribe"]>().mockResolvedValue(gatewayResult);
  return {
    consume,
    subscribe,
    handler: createNewsletterPostHandler({
      attemptGate: { consume },
      gateway: { subscribe },
      privacyHref: fictionalPrivacyHref,
    }),
  };
}

async function expectJson(
  response: Response,
  status: number,
  body: unknown,
): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toMatch(/^application\/json\b/iu);
  expect(await response.json()).toEqual(body);
}

function sizedJsonWithUnknownField(byteLength: number): string {
  const prefix = `{"email":"${fictionalEmail}","consent":true,"padding":"`;
  const suffix = '"}';
  const paddingLength = byteLength - new TextEncoder().encode(prefix + suffix).byteLength;
  if (paddingLength < 0) throw new Error("Fixture is larger than requested size.");
  return prefix + "x".repeat(paddingLength) + suffix;
}

describe("newsletter browser-safe contracts", () => {
  it("trims, clones, and freezes a strict valid subscription input", () => {
    const source = { email: `  ${fictionalEmail}  `, consent: true as const };
    const parsed = parseNewsletterSubscriptionInput(source);

    expect(parsed).toEqual({
      success: true,
      data: { email: fictionalEmail, consent: true },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.success && Object.isFrozen(parsed.data)).toBe(true);
    expect(source.email).toBe(`  ${fictionalEmail}  `);
  });

  it.each([
    ["non-object request", null, "request"],
    ["unknown key", { email: fictionalEmail, consent: true, token: "test-only" }, "request"],
    ["blank email", { email: "   ", consent: true }, "email"],
    ["malformed email", { email: "not-an-email", consent: true }, "email"],
    ["255-character email", { email: `${"a".repeat(242)}@example.test`, consent: true }, "email"],
    ["false consent", { email: fictionalEmail, consent: false }, "consent"],
    ["missing consent", { email: fictionalEmail }, "consent"],
  ] as const)("rejects %s with the fixed field", (_label, input, field) => {
    const parsed = parseNewsletterSubscriptionInput(input);

    expect(parsed).toEqual({
      success: false,
      result: { status: "INVALID", field },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(!parsed.success && Object.isFrozen(parsed.result)).toBe(true);
  });

  it("accepts an exactly 254-character valid email", () => {
    const email = `${"a".repeat(241)}@example.test`;
    expect(email).toHaveLength(254);

    expect(parseNewsletterSubscriptionInput({ email, consent: true })).toEqual({
      success: true,
      data: { email, consent: true },
    });
  });

  it.each([
    { status: "SUBSCRIBED" },
    { status: "DUPLICATE" },
    { status: "INVALID", field: "email" },
    { status: "INVALID", field: "consent" },
    { status: "INVALID", field: "request" },
    { status: "NEWSLETTER_NOT_CONFIGURED" },
    { status: "PROVIDER_ERROR" },
  ] as const)("strictly clones and freezes result $status", (result) => {
    const parsed = parseNewsletterResult(result);
    expect(parsed).toEqual(result);
    expect(parsed).not.toBe(result);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    null,
    { status: "SUBSCRIBED", email: fictionalEmail },
    { status: "UNKNOWN" },
    { status: "INVALID" },
    { status: "INVALID", field: "provider" },
  ])("rejects malformed or extra newsletter results", (result) => {
    expect(parseNewsletterResult(result)).toBeNull();
  });
});

describe("approved newsletter privacy destination", () => {
  it("brands only an exact safe destination from the explicit test-only policy", () => {
    expect(fictionalPrivacyHref.href).toBe("/test-only-fictional-privacy");
    expect(projectApprovedNewsletterPrivacyHref(
      "/test-only-fictional-privacy-extra",
      fictionalPrivacyDestinations,
    )).toBeNull();
  });

  it.each([
    ["external", "https://example.test/privacy"],
    ["protocol relative", "//example.test/privacy"],
    ["query", "/test-only-fictional-privacy?source=x"],
    ["fragment", "/test-only-fictional-privacy#notice"],
    ["encoded", "/test-only-fictional%2Dprivacy"],
    ["backslash", "/test-only-fictional\\privacy"],
    ["whitespace", " /test-only-fictional-privacy"],
    ["control", "/test-only-fictional-privacy\u0000"],
    ["protected", "/admin"],
    ["unknown", "/not-in-policy"],
  ] as const)("rejects a %s destination", (_label, value) => {
    expect(projectApprovedNewsletterPrivacyHref(
      value,
      Object.freeze([...fictionalPrivacyDestinations, "/admin"]),
    )).toBeNull();
  });

  it("keeps the production policy empty, frozen, and explicitly unconfigured", () => {
    expect(newsletterPrivacyDestinations).toEqual([]);
    expect(Object.isFrozen(newsletterPrivacyDestinations)).toBe(true);
    expect(newsletterConfiguration).toEqual({ privacyHref: null });
    expect(Object.isFrozen(newsletterConfiguration)).toBe(true);
  });
});

describe("newsletter server boundary", () => {
  it.each([
    ["gateway", { attemptGate: { consume: vi.fn() }, privacyHref: fictionalPrivacyHref }],
    ["attempt gate", { gateway: { subscribe: vi.fn() }, privacyHref: fictionalPrivacyHref }],
    ["privacy href", { gateway: { subscribe: vi.fn() }, attemptGate: { consume: vi.fn() } }],
    ["invalid privacy href", {
      gateway: { subscribe: vi.fn() },
      attemptGate: { consume: vi.fn() },
      privacyHref: "/admin" as never,
    }],
    ["unbranded safe-looking privacy href", {
      gateway: { subscribe: vi.fn() },
      attemptGate: { consume: vi.fn() },
      privacyHref: "/test-only-fictional-privacy" as never,
    }],
  ] as const)("fails closed before reading the body when %s is missing or invalid", async (_label, dependencies) => {
    const request = newsletterRequest();
    const response = await createNewsletterPostHandler(dependencies)(request);

    await expectJson(response, 503, { status: "NEWSLETTER_NOT_CONFIGURED" });
    expect(request.bodyUsed).toBe(false);
    for (const dependency of Object.values(dependencies)) {
      if (dependency && typeof dependency === "object") {
        for (const candidate of Object.values(dependency)) {
          if (typeof candidate === "function" && "mock" in candidate) {
            expect(candidate).not.toHaveBeenCalled();
          }
        }
      }
    }
  });

  it.each([
    ["absent", null],
    ["malformed", "://bad-origin"],
    ["external", "https://attacker.example.test"],
    ["protocol relative", "//attacker.example.test"],
    ["path-bearing", `${requestOrigin}/path`],
  ] as const)("rejects a %s Origin before gate or body", async (_label, origin) => {
    const { handler, consume, subscribe } = configuredRuntime();
    const request = newsletterRequest({ origin });
    const response = await handler(request);

    await expectJson(response, 403, { status: "PROVIDER_ERROR" });
    expect(request.bodyUsed).toBe(false);
    expect(consume).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each([null, "text/plain", "application/x-www-form-urlencoded"])(
    "rejects invalid JSON content type %s before gate or body",
    async (contentType) => {
      const { handler, consume, subscribe } = configuredRuntime();
      const request = newsletterRequest({ contentType });
      const response = await handler(request);

      await expectJson(response, 415, { status: "INVALID", field: "request" });
      expect(request.bodyUsed).toBe(false);
      expect(consume).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
    },
  );

  it("accepts the exact 1,024-byte declared boundary", async () => {
    const { handler, consume, subscribe } = configuredRuntime();
    const request = newsletterRequest({ contentLength: "1024" });
    const response = await handler(request);

    await expectJson(response, 200, { status: "SUBSCRIBED" });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it.each(["1025", "-1", "not-a-number"])(
    "rejects invalid or excessive declared content length %s before gate or body",
    async (contentLength) => {
      const { handler, consume, subscribe } = configuredRuntime();
      const request = newsletterRequest({ contentLength });
      const response = await handler(request);

      await expectJson(
        response,
        contentLength === "1025" ? 413 : 400,
        { status: "INVALID", field: "request" },
      );
      expect(request.bodyUsed).toBe(false);
      expect(consume).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
    },
  );

  it("reads exactly 1,024 actual UTF-8 bytes and then applies strict shape validation", async () => {
    const { handler, consume, subscribe } = configuredRuntime();
    const body = sizedJsonWithUnknownField(1024);
    expect(new TextEncoder().encode(body)).toHaveLength(1024);
    const response = await handler(newsletterRequest({ body }));

    await expectJson(response, 400, { status: "INVALID", field: "request" });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("rejects 1,025 actual UTF-8 bytes without calling the gateway", async () => {
    const { handler, consume, subscribe } = configuredRuntime();
    const body = sizedJsonWithUnknownField(1025);
    const response = await handler(newsletterRequest({ body }));

    await expectJson(response, 413, { status: "INVALID", field: "request" });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["limited", 429],
    ["unavailable", 503],
  ] as const)("maps an attempt gate %s decision before reading PII", async (decision, status) => {
    const { handler, consume, subscribe } = configuredRuntime({ decision });
    const request = newsletterRequest();
    const response = await handler(request);

    await expectJson(response, status, { status: "PROVIDER_ERROR" });
    expect(request.bodyUsed).toBe(false);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each(["throw", "reject"] as const)("maps attempt gate %s to a fixed 503", async (mode) => {
    const consume = vi.fn<NewsletterAttemptGate["consume"]>();
    if (mode === "throw") consume.mockImplementation(() => { throw new Error("test-only gate token"); });
    else consume.mockRejectedValue(new Error("test-only gate token"));
    const subscribe = vi.fn<NewsletterGateway["subscribe"]>();
    const handler = createNewsletterPostHandler({
      attemptGate: { consume },
      gateway: { subscribe },
      privacyHref: fictionalPrivacyHref,
    });
    const request = newsletterRequest();

    await expectJson(await handler(request), 503, { status: "PROVIDER_ERROR" });
    expect(request.bodyUsed).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{", { status: "INVALID", field: "request" }],
    ["unknown key", JSON.stringify({ email: fictionalEmail, consent: true, provider: "test" }), { status: "INVALID", field: "request" }],
    ["invalid email", JSON.stringify({ email: "bad", consent: true }), { status: "INVALID", field: "email" }],
    ["missing consent", JSON.stringify({ email: fictionalEmail }), { status: "INVALID", field: "consent" }],
  ] as const)("rejects %s after the allowed attempt", async (_label, body, expected) => {
    const { handler, consume, subscribe } = configuredRuntime();
    const response = await handler(newsletterRequest({ body }));

    await expectJson(response, 400, expected);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["subscribed", "SUBSCRIBED"],
    ["duplicate", "DUPLICATE"],
  ] as const)("maps the gateway %s result once", async (gatewayResult, status) => {
    const { handler, consume, subscribe } = configuredRuntime({ gatewayResult });
    const response = await handler(newsletterRequest({
      body: JSON.stringify({ email: `  ${fictionalEmail}  `, consent: true }),
    }));

    await expectJson(response, 200, { status });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ email: fictionalEmail, consent: true });
  });

  it.each(["throw", "reject", "malformed"] as const)("maps a gateway %s to a fixed 503", async (mode) => {
    const consume = vi.fn<NewsletterAttemptGate["consume"]>().mockResolvedValue("allowed");
    const subscribe = vi.fn<NewsletterGateway["subscribe"]>();
    if (mode === "throw") subscribe.mockImplementation(() => { throw new Error("test-only provider secret"); });
    else if (mode === "reject") subscribe.mockRejectedValue(new Error("test-only provider secret"));
    else subscribe.mockResolvedValue("unexpected" as never);
    const handler = createNewsletterPostHandler({
      attemptGate: { consume },
      gateway: { subscribe },
      privacyHref: fictionalPrivacyHref,
    });

    await expectJson(await handler(newsletterRequest()), 503, { status: "PROVIDER_ERROR" });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("does not log or leak PII, provider details, tokens, environment values, or stacks", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consume = vi.fn<NewsletterAttemptGate["consume"]>().mockResolvedValue("allowed");
    const subscribe = vi.fn<NewsletterGateway["subscribe"]>()
      .mockRejectedValue(new Error("test-only provider token STACK_MARKER"));
    const handler = createNewsletterPostHandler({
      attemptGate: { consume },
      gateway: { subscribe },
      privacyHref: fictionalPrivacyHref,
    });
    const response = await handler(newsletterRequest());
    const serialized = JSON.stringify(await response.json());

    expect(serialized).toBe('{"status":"PROVIDER_ERROR"}');
    expect(serialized).not.toContain(fictionalEmail);
    expect(serialized).not.toMatch(/provider token|STACK_MARKER|RESEND|environment/iu);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
    log.mockRestore();
  });
});
