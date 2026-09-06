import { describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";
import { createResendContactsPort } from "./resend-contacts-port";
import { createResendNewsletterGateway } from "./resend-gateway";

const topicId = "11111111-1111-4111-8111-111111111111";
const email = "newsletter-fixture@example.test";
const success = (data: unknown) => ({ data, error: null });
const topics = (subscription = "opt_in") => success({
  data: [{ id: topicId, subscription }], has_more: false,
});
function fixture() {
  // Minimal Resend SDK test double; no external email or contact is created.
  const contacts = {
    get: vi.fn().mockResolvedValue(success({ id: "fixture-contact", unsubscribed: false })),
    create: vi.fn().mockResolvedValue(success({ id: "fixture-contact" })),
    topics: {
      list: vi.fn().mockResolvedValue(topics()),
      update: vi.fn().mockResolvedValue(success({ id: "fixture-contact" })),
    },
  };
  const gateway = createResendNewsletterGateway({
    topicId, contacts: createResendContactsPort(contacts as unknown as Resend["contacts"]),
  });
  return { contacts, subscribe: () => gateway.subscribe({ email, consent: true }) };
}
describe("Resend newsletter subscription lifecycle", () => {
  it.each([404, undefined])("creates a new contact with the documented not_found result and optional statusCode %s", async (statusCode) => {
    const f = fixture();
    f.contacts.get.mockResolvedValue({ data: null, error: { name: "not_found", statusCode } });
    await expect(f.subscribe()).resolves.toBe("subscribed");
    expect(f.contacts.create).toHaveBeenCalledWith({ email, topics: [{ id: topicId, subscription: "opt_in" }] });
  });
  it("rejects an inconsistent not_found status without creating a contact", async () => {
    const f = fixture();
    f.contacts.get.mockResolvedValue({ data: null, error: { name: "not_found", statusCode: 403 } });
    await expect(f.subscribe()).rejects.toThrow("Newsletter provider request failed.");
    expect(f.contacts.create).not.toHaveBeenCalled();
  });
  it("reports confirmed duplicate topic subscriptions without another mutation", async () => {
    const f = fixture();
    await expect(f.subscribe()).resolves.toBe("duplicate");
    expect(f.contacts.create).not.toHaveBeenCalled();
    expect(f.contacts.topics.update).not.toHaveBeenCalled();
  });
  it("updates only the opted-out newsletter topic after explicit consent", async () => {
    const f = fixture();
    f.contacts.topics.list.mockResolvedValue(topics("opt_out"));
    await expect(f.subscribe()).resolves.toBe("subscribed");
    expect(f.contacts.topics.update).toHaveBeenCalledWith({ email, topics: [{ id: topicId, subscription: "opt_in" }] });
    expect(f.contacts.create).not.toHaveBeenCalled();
  });
  it("reads subsequent topic pages before deciding duplicate status", async () => {
    const f = fixture();
    f.contacts.topics.list.mockResolvedValueOnce(success({ data: [{ id: "other-topic", subscription: "opt_in" }], has_more: true }));
    await expect(f.subscribe()).resolves.toBe("duplicate");
    expect(f.contacts.topics.list).toHaveBeenLastCalledWith({ email, limit: 100, after: "other-topic" });
  });
  it("does not revive a globally unsubscribed contact or claim success", async () => {
    const f = fixture();
    f.contacts.get.mockResolvedValue(success({ id: "fixture-contact", unsubscribed: true }));
    await expect(f.subscribe()).rejects.toThrow("Newsletter provider request failed.");
    expect(f.contacts.create).not.toHaveBeenCalled();
    expect(f.contacts.topics.update).not.toHaveBeenCalled();
  });
  it.each(["lookup", "topics", "write"])("hides %s failures and never claims subscription", async (stage) => {
    const f = fixture();
    const failure = { data: null, error: { name: "application_error", message: "private provider detail" } };
    if (stage === "lookup") f.contacts.get.mockResolvedValue(failure);
    if (stage === "topics") f.contacts.topics.list.mockResolvedValue(failure);
    if (stage === "write") {
      f.contacts.topics.list.mockResolvedValue(topics("opt_out"));
      f.contacts.topics.update.mockResolvedValue(failure);
    }
    await expect(f.subscribe()).rejects.toThrow("Newsletter provider request failed.");
  });
});
