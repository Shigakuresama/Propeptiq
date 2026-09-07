import "server-only";

import type { ContactInput } from "@/contact/contracts";

export type ContactEmailPort = Readonly<{
  send: (message: Readonly<{
    from: string;
    to: readonly string[];
    replyTo: string;
    subject: string;
    text: string;
  }>, options: Readonly<{ idempotencyKey: string }>) => Promise<unknown>;
}>;

export type ContactGateway = Readonly<{
  send: (input: ContactInput, idempotencyKey: string) => Promise<Readonly<{ accepted: true; providerId: string }> | Readonly<{ accepted: false }>>;
}>;

const providerIdPattern = /^[\u0021-\u007e]{1,256}$/u;

export function createResendContactGateway(input: Readonly<{
  emails: ContactEmailPort;
  from: string;
  supportRecipient: string;
}>): ContactGateway {
  if (!input.from || !input.supportRecipient || typeof input.emails.send !== "function") {
    throw new Error("Contact provider configuration is invalid.");
  }
  return Object.freeze({
    async send(contact, idempotencyKey) {
      const uncertain = () => { throw new Error("Contact acceptance could not be confirmed."); };
      let response: unknown;
      try {
        response = await Reflect.apply(input.emails.send, input.emails, [{
          from: input.from,
          to: [input.supportRecipient],
          replyTo: contact.email,
          subject: `Contact: ${contact.subject.replace(/[\r\n]+/gu, " ")}`,
          text: [
            `Name: ${contact.name}`,
            `Email: ${contact.email}`,
            `Order reference: ${contact.orderReference || "Not provided"}`,
            "",
            contact.message,
          ].join("\n"),
        }, { idempotencyKey }]);
      } catch {
        return uncertain();
      }
      if (response === null || typeof response !== "object" || Array.isArray(response)) return uncertain();
      const record = response as Record<string, unknown>;
      if (record.error !== null) {
        // Resend resolves network/JSON errors as application_error with a null
        // statusCode. These can follow a successful send; keep its reservation.
        const error = record.error;
        const statusCode = error && typeof error === "object"
          ? (error as Record<string, unknown>).statusCode : null;
        if (typeof statusCode === "number" && [400, 401, 403, 404, 422, 429].includes(statusCode)) {
          return { accepted: false };
        }
        return uncertain();
      }
      const data = record.data;
      if (data === null || typeof data !== "object" || Array.isArray(data)) return uncertain();
      const providerId = (data as Record<string, unknown>).id;
      return typeof providerId === "string" && providerIdPattern.test(providerId)
        ? { accepted: true, providerId }
        : uncertain();
    },
  });
}
