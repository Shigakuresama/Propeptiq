import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";
import {
  projectApprovedNewsletterPrivacyHref,
  type ApprovedNewsletterPrivacyHref,
} from "@/lib/site-content";
import type { ResendContactsCreatePort } from "@/newsletter/resend-gateway";
import {
  createNewsletterRuntimePostHandler,
  type NewsletterRuntimeConfiguration,
} from "@/newsletter/runtime";

const fictionalEmail = "runtime-subscriber@example.test";
const fictionalTopicId = "11111111-1111-4111-8111-111111111111";
const fictionalPrivacyHref = projectApprovedNewsletterPrivacyHref(
  "/test-only-fictional-privacy",
  Object.freeze(["/test-only-fictional-privacy"]),
)!;
const enabledConfiguration: NewsletterRuntimeConfiguration = Object.freeze({
  enabled: true,
  privacyHref: fictionalPrivacyHref,
});

function testEnvironment(mode: "disabled" | "test" = "test") {
  return parseServerEnv(mode === "disabled"
    ? {
        NEWSLETTER_MODE: "disabled",
        NEWSLETTER_RESEND_API_KEY: "re_synthetic_installed_inert",
        NEWSLETTER_RESEND_TOPIC_ID: fictionalTopicId,
        NEWSLETTER_RATE_LIMIT_MAX: "4",
        NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: "600",
      }
    : {
        NEWSLETTER_MODE: "test",
        NEWSLETTER_RESEND_API_KEY: "re_synthetic_newsletter_runtime",
        NEWSLETTER_RESEND_TOPIC_ID: fictionalTopicId,
        NEWSLETTER_RATE_LIMIT_MAX: "4",
        NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: "600",
        RATE_LIMIT_SECRET:
          "synthetic-newsletter-runtime-rate-limit-secret-0123456789",
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://synthetic_newsletter:synthetic_password@db.example.invalid/propeptiq_newsletter_test",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      });
}

function closedRequest(): Request {
  return new Request("https://store.example.test/api/newsletter", {
    method: "POST",
    headers: {
      Origin: "https://attacker.example.test",
      "Content-Type": "text/plain",
    },
    body: JSON.stringify({ email: fictionalEmail, consent: true }),
  });
}

function configuredRequest(): Request {
  return new Request("https://store.example.test/api/newsletter", {
    method: "POST",
    headers: {
      Origin: "https://store.example.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: fictionalEmail, consent: true }),
  });
}

function databaseSession(count = 1) {
  const query = vi.fn().mockResolvedValue({ rows: [{ count }] });
  const release = vi.fn();
  return {
    query,
    release,
    session: { query, release } as never,
  };
}

async function expectClosed(handler: (request: Request) => Promise<Response>) {
  const request = closedRequest();
  const response = await handler(request);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "NEWSLETTER_NOT_CONFIGURED" });
  expect(request.bodyUsed).toBe(false);
}

describe("createNewsletterRuntimePostHandler", () => {
  it.each([
    ["disabled flag", Object.freeze({
      enabled: false,
      privacyHref: fictionalPrivacyHref,
    })],
    ["missing privacy", Object.freeze({
      enabled: true,
      privacyHref: null,
    })],
    ["unapproved privacy", Object.freeze({
      enabled: true,
      privacyHref: "/privacy-policy" as never,
    })],
  ] as const)("closes on %s before reading environment or constructing adapters", async (
    _label,
    configuration,
  ) => {
    const readEnvironment = vi.fn(() => testEnvironment());
    const createContactsPort = vi.fn();
    const connectDatabase = vi.fn();
    const handler = createNewsletterRuntimePostHandler({
      configuration,
      connectDatabase,
      createContactsPort,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      readEnvironment,
    });

    await expectClosed(handler);
    expect(readEnvironment).not.toHaveBeenCalled();
    expect(createContactsPort).not.toHaveBeenCalled();
    expect(connectDatabase).not.toHaveBeenCalled();
  });

  it("keeps installed environment values inert when newsletter mode is disabled", async () => {
    const readEnvironment = vi.fn(() => testEnvironment("disabled"));
    const createContactsPort = vi.fn();
    const connectDatabase = vi.fn();
    const handler = createNewsletterRuntimePostHandler({
      configuration: enabledConfiguration,
      connectDatabase,
      createContactsPort,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      readEnvironment,
    });

    await expectClosed(handler);
    expect(readEnvironment).toHaveBeenCalledTimes(1);
    expect(createContactsPort).not.toHaveBeenCalled();
    expect(connectDatabase).not.toHaveBeenCalled();
  });

  it("composes both adapters once while keeping database and provider requests lazy", async () => {
    const create = vi.fn<ResendContactsCreatePort["create"]>().mockResolvedValue({
      data: { id: "contact_runtime_test", object: "contact" },
      error: null,
      headers: null,
    });
    const createContactsPort = vi.fn(() => ({ create }));
    const database = databaseSession();
    const connectDatabase = vi.fn().mockResolvedValue(database.session);
    const readEnvironment = vi.fn(() => testEnvironment());

    const handler = createNewsletterRuntimePostHandler({
      configuration: enabledConfiguration,
      connectDatabase,
      createContactsPort,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      readEnvironment,
    });

    expect(readEnvironment).toHaveBeenCalledTimes(1);
    expect(createContactsPort).toHaveBeenCalledTimes(1);
    expect(createContactsPort).toHaveBeenCalledWith(
      "re_synthetic_newsletter_runtime",
    );
    expect(connectDatabase).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    const response = await handler(configuredRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "SUBSCRIBED" });
    expect(connectDatabase).toHaveBeenCalledTimes(1);
    expect(connectDatabase).toHaveBeenCalledWith(testEnvironment());
    expect(database.release).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      email: fictionalEmail,
      topics: [{ id: fictionalTopicId, subscription: "opt_in" }],
    });
  });

  it("does not downgrade a strict environment failure into an unconfigured route", () => {
    const expected = new Error("Invalid server configuration: test-only");
    const readEnvironment = vi.fn(() => {
      throw expected;
    });

    expect(() => createNewsletterRuntimePostHandler({
      configuration: enabledConfiguration,
      connectDatabase: vi.fn(),
      createContactsPort: vi.fn(),
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      readEnvironment,
    })).toThrow(expected);
    expect(readEnvironment).toHaveBeenCalledTimes(1);
  });

  it("fails construction rather than partially enabling a forged incomplete environment", () => {
    const incomplete = {
      ...testEnvironment("disabled"),
      NEWSLETTER_MODE: "test",
    } as ReturnType<typeof testEnvironment>;

    expect(() => createNewsletterRuntimePostHandler({
      configuration: enabledConfiguration,
      connectDatabase: vi.fn(),
      createContactsPort: vi.fn(),
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      readEnvironment: () => incomplete,
    })).toThrow("Newsletter runtime configuration is invalid.");
  });

  it("does not accept a cloned production-unapproved privacy projection", async () => {
    const cloned = JSON.parse(JSON.stringify(fictionalPrivacyHref)) as
      ApprovedNewsletterPrivacyHref;
    const readEnvironment = vi.fn(() => testEnvironment());
    const handler = createNewsletterRuntimePostHandler({
      configuration: Object.freeze({ enabled: true, privacyHref: cloned }),
      connectDatabase: vi.fn(),
      createContactsPort: vi.fn(),
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      readEnvironment,
    });

    await expectClosed(handler);
    expect(readEnvironment).not.toHaveBeenCalled();
  });
});
