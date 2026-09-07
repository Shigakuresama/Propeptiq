import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "@/config/env-schema";
import { createProductionContactPostHandler, isContactRuntimeConfigured } from "@/contact/runtime";
import type { RuntimeDatabaseSession } from "@/db/runtime";

// Test doubles isolate the production composition from live email and database services.
const services = vi.hoisted(() => ({
  readServerEnv: vi.fn(),
  connect: vi.fn(),
  Resend: vi.fn(),
  send: vi.fn(),
  reserve: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
}));

vi.mock("@/env", () => ({ readServerEnv: services.readServerEnv }));
vi.mock("@/db/runtime", () => ({ connectRuntimeDatabaseSession: services.connect }));
vi.mock("resend", () => ({ Resend: services.Resend }));
vi.mock("@/db/repositories/contact-delivery-store", () => ({
  createPostgresContactDeliveryStore: () => ({
    reserve: services.reserve,
    accept: services.accept,
    reject: services.reject,
  }),
}));

const configured = {
  APP_ENV: "preview",
  APP_ORIGIN: "https://preview.example.test",
  EMAIL_MODE: "test",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL: "postgresql://synthetic@database.example.test/contact_test",
  AUTH_EMAIL_DELIVERY_VERIFIED: "verified",
  RESEND_API_KEY: "re_synthetic",
  RESEND_FROM: "from@example.test",
  CONTACT_SUPPORT_EMAIL: "support@example.test",
  CONTACT_RATE_LIMIT_MAX: 3,
  CONTACT_RATE_LIMIT_WINDOW_SECONDS: 600,
  RATE_LIMIT_SECRET: "synthetic-contact-rate-secret-0123456789ABCDE",
} as ServerEnv;

describe("contact runtime configuration", () => {
  it("requires explicit verified sender delivery evidence", () => {
    expect(isContactRuntimeConfigured(configured)).toBe(true);
    expect(isContactRuntimeConfigured({ ...configured, AUTH_EMAIL_DELIVERY_VERIFIED: undefined })).toBe(false);
  });

  it("requires an explicit recipient and matching database/email modes", () => {
    expect(isContactRuntimeConfigured({ ...configured, CONTACT_SUPPORT_EMAIL: undefined })).toBe(false);
    expect(isContactRuntimeConfigured({ ...configured, DATABASE_MODE: "disabled" })).toBe(false);
    expect(isContactRuntimeConfigured({ ...configured, EMAIL_MODE: "live" })).toBe(false);
  });

  it.each(["test", "live"] as const)("requires the %s mode database URL without falling back to the other mode", (mode) => {
    // Both URLs are synthetic test doubles; no database service is contacted.
    const environment: ServerEnv = {
      ...configured,
      DATABASE_MODE: mode,
      EMAIL_MODE: mode,
      DATABASE_URL: "postgresql://synthetic@database.example.test/contact_live",
    };
    const requiredUrl = mode === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
    expect(isContactRuntimeConfigured(environment)).toBe(true);
    expect(isContactRuntimeConfigured({ ...environment, [requiredUrl]: undefined })).toBe(false);
    expect(isContactRuntimeConfigured({ ...environment, [requiredUrl]: "" })).toBe(false);
  });
});

describe("production contact composition", () => {
  const production = {
    ...configured,
    APP_ENV: "production",
    EMAIL_MODE: "live",
    DATABASE_MODE: "live",
    DATABASE_URL: "postgresql://synthetic@database.example.test/contact_live",
    TEST_DATABASE_URL: undefined,
  } as ServerEnv;
  const requestId = "10000000-0000-4000-8000-000000000001";
  const query = vi.fn(async () => ({ rows: [{ count: 1 }] }));
  const release = vi.fn();

  function request() {
    return new Request(`${production.APP_ORIGIN}/api/contact`, {
      method: "POST",
      headers: {
        origin: production.APP_ORIGIN!,
        "content-type": "application/json",
        "x-vercel-forwarded-for": "192.0.2.1",
      },
      body: JSON.stringify({
        requestId, name: "Ada", email: "ADA@example.test", subject: "Records",
        message: "Please send details.", orderReference: "", website: "",
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    services.readServerEnv.mockReturnValue(production);
    services.connect.mockResolvedValue({ query: query as RuntimeDatabaseSession["query"], release });
    services.Resend.mockImplementation(function () { return { emails: { send: services.send } }; });
    services.send.mockResolvedValue({ data: { id: "synthetic-email-id" }, error: null });
    services.reserve.mockResolvedValue("reserved");
    services.accept.mockResolvedValue(true);
  });

  it("uses the server key and fixed support recipient, with the visitor address only as reply-to", async () => {
    const result = await createProductionContactPostHandler()(request());

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ status: "ACCEPTED" });
    expect(services.Resend).toHaveBeenCalledExactlyOnceWith(production.RESEND_API_KEY);
    expect(services.connect).toHaveBeenCalledExactlyOnceWith(production);
    expect(services.send).toHaveBeenCalledExactlyOnceWith({
      from: production.RESEND_FROM,
      to: [production.CONTACT_SUPPORT_EMAIL],
      replyTo: "ada@example.test",
      subject: "Contact: Records",
      text: "Name: Ada\nEmail: ada@example.test\nOrder reference: Not provided\n\nPlease send details.",
    }, { idempotencyKey: `contact/${requestId}` });
    expect(services.accept).toHaveBeenCalledWith(
      `contact/${requestId}`, expect.stringMatching(/^[0-9a-f]{64}$/u), "synthetic-email-id", expect.any(Date),
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("keeps a key without a configured recipient unavailable without connecting or sending", async () => {
    services.readServerEnv.mockReturnValue({ ...production, CONTACT_SUPPORT_EMAIL: undefined });

    const result = await createProductionContactPostHandler()(request());

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ status: "UNAVAILABLE" });
    expect(services.Resend).not.toHaveBeenCalled();
    expect(services.connect).not.toHaveBeenCalled();
    expect(services.send).not.toHaveBeenCalled();
  });

  it.each(["test", "live"] as const)("keeps incomplete %s database configuration unavailable without connecting or sending", async (mode) => {
    services.readServerEnv.mockReturnValue({
      ...production,
      APP_ENV: mode === "test" ? "preview" : "production",
      EMAIL_MODE: mode,
      DATABASE_MODE: mode,
      DATABASE_URL: mode === "test" ? production.DATABASE_URL : undefined,
      TEST_DATABASE_URL: mode === "live" ? configured.TEST_DATABASE_URL : undefined,
    });

    const result = await createProductionContactPostHandler()(request());

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ status: "UNAVAILABLE" });
    expect(services.Resend).not.toHaveBeenCalled();
    expect(services.connect).not.toHaveBeenCalled();
    expect(services.send).not.toHaveBeenCalled();
  });
});
