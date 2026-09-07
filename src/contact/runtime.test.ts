import { describe, expect, it } from "vitest";

import type { ServerEnv } from "@/config/env-schema";
import { isContactRuntimeConfigured } from "@/contact/runtime";

const configured = {
  APP_ENV: "preview",
  APP_ORIGIN: "https://preview.example.test",
  EMAIL_MODE: "test",
  DATABASE_MODE: "test",
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
  });
});
