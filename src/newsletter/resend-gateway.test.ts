import { describe, expect, it, vi } from "vitest";

import {
  createResendNewsletterGateway,
  type ResendContactsCreatePort,
} from "@/newsletter/resend-gateway";

const fictionalTopicId = "11111111-1111-4111-8111-111111111111";
const fictionalEmail = "researcher@example.test";

function providerSuccess(id = "contact_test_123") {
  return {
    data: { id, object: "contact" },
    error: null,
    headers: null,
  };
}

function gatewayWith(create: ResendContactsCreatePort["create"]) {
  return createResendNewsletterGateway({
    contacts: { create },
    topicId: fictionalTopicId,
  });
}

describe("createResendNewsletterGateway", () => {
  it("normalizes a valid address and makes one exact topic opt-in request", async () => {
    const create = vi.fn<ResendContactsCreatePort["create"]>()
      .mockResolvedValue(providerSuccess());
    const gateway = gatewayWith(create);
    const input = Object.freeze({
      email: `  ${fictionalEmail}  `,
      consent: true as const,
    });

    await expect(gateway.subscribe(input)).resolves.toBe("subscribed");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      email: fictionalEmail,
      topics: [{ id: fictionalTopicId, subscription: "opt_in" }],
    });
    expect(input.email).toBe(`  ${fictionalEmail}  `);

    const payload = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["email", "topics"]);
    expect(JSON.stringify(payload)).not.toMatch(
      /audience|segment|propert|unsubscribed|firstName|lastName|source|agent|product/iu,
    );
  });

  it("accepts the same canonical uppercase UUID form as the environment parser", async () => {
    const topicId = "11111111-1111-4111-8111-AAAAAAAAAAAA";
    const create = vi.fn<ResendContactsCreatePort["create"]>()
      .mockResolvedValue(providerSuccess());
    const gateway = createResendNewsletterGateway({ contacts: { create }, topicId });

    await expect(gateway.subscribe({ email: fictionalEmail, consent: true }))
      .resolves.toBe("subscribed");
    expect(create).toHaveBeenCalledWith({
      email: fictionalEmail,
      topics: [{ id: topicId, subscription: "opt_in" }],
    });
  });

  it.each([
    ["invalid email", { email: "invalid", consent: true }],
    ["missing consent", { email: fictionalEmail }],
    ["false consent", { email: fictionalEmail, consent: false }],
    ["unexpected field", { email: fictionalEmail, consent: true, source: "test" }],
  ] as const)("rejects %s before calling Resend", async (_label, input) => {
    const create = vi.fn<ResendContactsCreatePort["create"]>();

    await expect(gatewayWith(create).subscribe(input as never)).rejects.toThrow(
      "Newsletter provider request failed.",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["provider error", {
      data: null,
      error: {
        message: `provider rejected ${fictionalEmail}`,
        statusCode: 422,
        name: "validation_error",
      },
      headers: null,
    }],
    ["null result", null],
    ["missing data", { error: null, headers: null }],
    ["blank id", providerSuccess("   ")],
    ["control id", providerSuccess("contact\u0000test")],
    ["non-printable Unicode id", providerSuccess("contact\u2028test")],
    ["non-ASCII id", providerSuccess("contact_🧪")],
    ["oversized id", providerSuccess("x".repeat(257))],
    ["non-string id", {
      data: { id: 42, object: "contact" },
      error: null,
      headers: null,
    }],
  ] as const)("maps a %s to one fixed internal failure", async (_label, result) => {
    const create = vi.fn<ResendContactsCreatePort["create"]>()
      .mockResolvedValue(result as never);

    let caught: unknown;
    try {
      await gatewayWith(create).subscribe({ email: fictionalEmail, consent: true });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Newsletter provider request failed.");
    expect((caught as Error).message).not.toContain(fictionalEmail);
    expect((caught as Error).message).not.toMatch(/422|validation|contact_test/iu);
  });

  it.each(["throw", "reject"] as const)(
    "hides a provider %s without classifying it as a duplicate",
    async (mode) => {
      const create = vi.fn<ResendContactsCreatePort["create"]>();
      if (mode === "throw") {
        create.mockImplementation(() => {
          throw new Error(`duplicate ${fictionalEmail} status 409`);
        });
      } else {
        create.mockRejectedValue(new Error(`duplicate ${fictionalEmail} status 409`));
      }

      await expect(
        gatewayWith(create).subscribe({ email: fictionalEmail, consent: true }),
      ).rejects.toThrow("Newsletter provider request failed.");
    },
  );

  it("fails closed when a provider response accessor or proxy throws", async () => {
    const accessor = Object.defineProperty({}, "error", {
      get() {
        throw new Error(`provider accessor leaked ${fictionalEmail}`);
      },
    });
    const revocable = Proxy.revocable(providerSuccess(), {});
    revocable.revoke();

    for (const result of [accessor, revocable.proxy]) {
      const create = vi.fn<ResendContactsCreatePort["create"]>()
        .mockResolvedValue(result as never);
      await expect(
        gatewayWith(create).subscribe({ email: fictionalEmail, consent: true }),
      ).rejects.toThrow("Newsletter provider request failed.");
    }
  });

  it.each([
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-1111-1111-111111111111",
    " 11111111-1111-4111-8111-111111111111",
  ])("rejects invalid topic identity %s before provider work", async (topicId) => {
    const create = vi.fn<ResendContactsCreatePort["create"]>();

    expect(() => createResendNewsletterGateway({
      contacts: { create },
      topicId,
    })).toThrow("Newsletter provider configuration is invalid.");
    expect(create).not.toHaveBeenCalled();
  });

  it("maps a hostile non-string topic value to the fixed configuration failure", () => {
    const create = vi.fn<ResendContactsCreatePort["create"]>();

    expect(() => createResendNewsletterGateway({
      contacts: { create },
      topicId: Symbol("topic") as never,
    })).toThrow("Newsletter provider configuration is invalid.");
  });
});
