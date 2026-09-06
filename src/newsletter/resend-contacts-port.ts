import "server-only";

import type { Resend } from "resend";
import type { ResendContactsCreatePort } from "@/newsletter/resend-gateway";

/** Resend remains the subscriber source of truth; no in-memory subscriber list. */
export function createResendContactsPort(contacts: Resend["contacts"]): ResendContactsCreatePort {
  return {
    create(input) {
      return contacts.create({ email: input.email, topics: [...input.topics] });
    },
    updateTopics(input) {
      return contacts.topics.update({ email: input.email, topics: [...input.topics] });
    },
    async subscriptionState(email, topicId) {
      const contact = await contacts.get({ email });
      // Resend documents not_found as 404; the SDK's statusCode is optional.
      // Do not classify authentication, permission or other failures as absence.
      if (contact.error?.name === "not_found" &&
        (contact.error.statusCode === undefined || contact.error.statusCode === 404)) return "new";
      if (contact.error || !contact.data?.id || contact.data.unsubscribed !== false) {
        // Never undo a global unsubscribe through a topic form.
        throw new Error("Newsletter provider request failed.");
      }
      let after: string | undefined;
      const visited = new Set<string>();
      for (let page = 0; page < 20; page += 1) {
        const result = await contacts.topics.list({
          email, limit: 100, ...(after ? { after } : {}),
        });
        if (result.error || !Array.isArray(result.data?.data)) {
          throw new Error("Newsletter provider request failed.");
        }
        const topic = result.data.data.find((entry) => entry.id === topicId);
        if (topic) {
          if (topic.subscription === "opt_in") return "subscribed";
          if (topic.subscription === "opt_out") return "existing";
          throw new Error("Newsletter provider request failed.");
        }
        if (result.data.has_more === false) return "existing";
        after = result.data.data.at(-1)?.id;
        if (!after || visited.has(after)) throw new Error("Newsletter provider request failed.");
        visited.add(after);
      }
      throw new Error("Newsletter provider request failed.");
    },
  };
}
