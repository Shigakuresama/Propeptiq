import "server-only";

import {
  parseNewsletterSubscriptionInput,
  type NewsletterSubscriptionInput,
} from "@/newsletter/contracts";
import type {
  NewsletterGateway,
} from "@/newsletter/server";

type ResendTopicSubscription = Readonly<{
  id: string;
  subscription: "opt_in";
}>;

export type ResendContactCreateInput = Readonly<{
  email: string;
  topics: readonly ResendTopicSubscription[];
}>;

export type ResendContactsCreatePort = Readonly<{
  create: (input: ResendContactCreateInput) => Promise<unknown>;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const nilUuid = "00000000-0000-0000-0000-000000000000";
const maximumContactIdLength = 256;
const printableAsciiContactId = /^[\u0021-\u007e]+$/u;

function providerFailure(): Error {
  return new Error("Newsletter provider request failed.");
}

function ownDataValue(value: object, key: PropertyKey): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw providerFailure();
  }
  return descriptor.value;
}

function isProviderSuccess(value: unknown): boolean {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    if (ownDataValue(value, "error") !== null) return false;

    const data = ownDataValue(value, "data");
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return false;
    }
    const id = ownDataValue(data, "id");
    return typeof id === "string" &&
      id.length > 0 &&
      id.length <= maximumContactIdLength &&
      id === id.trim() &&
      printableAsciiContactId.test(id);
  } catch {
    return false;
  }
}

export function createResendNewsletterGateway(input: Readonly<{
  contacts: ResendContactsCreatePort;
  topicId: string;
}>): NewsletterGateway {
  let create: ResendContactsCreatePort["create"];
  let topicId: string;
  try {
    create = input.contacts.create;
    topicId = input.topicId;
  } catch {
    throw new Error("Newsletter provider configuration is invalid.");
  }
  if (
    typeof create !== "function" ||
    typeof topicId !== "string" ||
    topicId === nilUuid ||
    !uuidPattern.test(topicId)
  ) {
    throw new Error("Newsletter provider configuration is invalid.");
  }

  return Object.freeze({
    async subscribe(
      value: NewsletterSubscriptionInput,
    ): Promise<"subscribed"> {
      let parsed: ReturnType<typeof parseNewsletterSubscriptionInput>;
      try {
        parsed = parseNewsletterSubscriptionInput(value);
      } catch {
        throw providerFailure();
      }
      if (!parsed.success) throw providerFailure();

      const payload = Object.freeze({
        email: parsed.data.email,
        topics: Object.freeze([
          Object.freeze({
            id: topicId,
            subscription: "opt_in" as const,
          }),
        ]),
      });

      let response: unknown;
      try {
        response = await Reflect.apply(create, input.contacts, [payload]);
      } catch {
        throw providerFailure();
      }
      if (!isProviderSuccess(response)) throw providerFailure();
      return "subscribed";
    },
  });
}
