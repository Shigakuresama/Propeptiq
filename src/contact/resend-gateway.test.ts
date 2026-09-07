import { describe, expect, it, vi } from "vitest";

import { createResendContactGateway } from "@/contact/resend-gateway";

const contact = { requestId: "10000000-0000-4000-8000-000000000001", name: "Ada <Research>", email: "ada@example.test", subject: "Question\r\nBcc: unsafe", message: "Literal <script> stays text.", orderReference: "ORD-7", website: "" };

describe("Resend contact gateway", () => {
  it("uses the configured recipient, user Reply-To, plain text, and stable idempotency option", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email_synthetic_1" }, error: null });
    const gateway = createResendContactGateway({ emails: { send }, from: "supporter@example.test", supportRecipient: "support@example.test" });
    await expect(gateway.send(contact, "contact/abc")).resolves.toEqual({ accepted: true, providerId: "email_synthetic_1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "supporter@example.test", to: ["support@example.test"], replyTo: "ada@example.test",
      subject: "Contact: Question Bcc: unsafe", text: expect.stringContaining("Literal <script> stays text."),
    }), { idempotencyKey: "contact/abc" });
    expect(send.mock.calls[0]?.[0]).not.toHaveProperty("html");
  });

  it.each([400, 401, 403, 404, 422, 429])
  ("returns a definitive rejection for provider HTTP %s", async (statusCode) => {
    const providerResponse = { data: null, error: { name: "validation_error", statusCode }, headers: null };
    const gateway = createResendContactGateway({ emails: { send: vi.fn().mockResolvedValue(providerResponse) }, from: "from@example.test", supportRecipient: "support@example.test" });
    await expect(gateway.send(contact, "contact/abc")).resolves.toEqual({ accepted: false });
  });

  it.each([
    { data: null, error: { name: "application_error", statusCode: null }, headers: null },
    { data: null, error: { name: "internal_server_error", statusCode: 500 }, headers: null },
    { data: {}, error: null, headers: null },
    { data: { id: "" }, error: null, headers: null },
  ])("rejects ambiguous resolved SDK responses with a safe generic error", async (providerResponse) => {
    const gateway = createResendContactGateway({ emails: { send: vi.fn().mockResolvedValue(providerResponse) }, from: "from@example.test", supportRecipient: "support@example.test" });
    await expect(gateway.send(contact, "contact/abc")).rejects.toThrow("Contact acceptance could not be confirmed.");
  });

  it("turns provider throws into a safe generic rejection", async () => {
    const gateway = createResendContactGateway({ emails: { send: vi.fn().mockRejectedValue(new Error("private provider detail")) }, from: "from@example.test", supportRecipient: "support@example.test" });
    await expect(gateway.send(contact, "contact/abc")).rejects.toThrow("Contact acceptance could not be confirmed.");
  });
});
