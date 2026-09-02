import { z } from "zod";

export type NewsletterSubscriptionInput = Readonly<{
  email: string;
  consent: true;
}>;

export type NewsletterResult =
  | Readonly<{ status: "SUBSCRIBED" }>
  | Readonly<{ status: "DUPLICATE" }>
  | Readonly<{ status: "INVALID"; field: "email" | "consent" | "request" }>
  | Readonly<{ status: "NEWSLETTER_NOT_CONFIGURED" }>
  | Readonly<{ status: "PROVIDER_ERROR" }>;

export type NewsletterSubscriptionParseResult =
  | Readonly<{
      success: true;
      data: NewsletterSubscriptionInput;
    }>
  | Readonly<{
      success: false;
      result: Extract<NewsletterResult, { status: "INVALID" }>;
    }>;

const newsletterSubscriptionSchema = z.object({
  email: z.string().trim().min(1).max(254).email(),
  consent: z.literal(true),
}).strict();

const newsletterResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SUBSCRIBED") }).strict(),
  z.object({ status: z.literal("DUPLICATE") }).strict(),
  z.object({
    status: z.literal("INVALID"),
    field: z.enum(["email", "consent", "request"]),
  }).strict(),
  z.object({ status: z.literal("NEWSLETTER_NOT_CONFIGURED") }).strict(),
  z.object({ status: z.literal("PROVIDER_ERROR") }).strict(),
]);

function frozenInvalid(
  field: "email" | "consent" | "request",
): NewsletterSubscriptionParseResult {
  return Object.freeze({
    success: false,
    result: Object.freeze({ status: "INVALID", field }),
  });
}

export function parseNewsletterSubscriptionInput(
  value: unknown,
): NewsletterSubscriptionParseResult {
  const parsed = newsletterSubscriptionSchema.safeParse(value);
  if (parsed.success) {
    return Object.freeze({
      success: true,
      data: Object.freeze({
        email: parsed.data.email,
        consent: true,
      }),
    });
  }

  let hasRequestIssue = false;
  let hasEmailIssue = false;
  let hasConsentIssue = false;
  for (const issue of parsed.error.issues) {
    if (issue.code === "unrecognized_keys" || issue.path.length === 0) {
      hasRequestIssue = true;
    } else if (issue.path[0] === "email") {
      hasEmailIssue = true;
    } else if (issue.path[0] === "consent") {
      hasConsentIssue = true;
    } else {
      hasRequestIssue = true;
    }
  }

  if (hasRequestIssue) return frozenInvalid("request");
  if (hasEmailIssue) return frozenInvalid("email");
  if (hasConsentIssue) return frozenInvalid("consent");
  return frozenInvalid("request");
}

export function parseNewsletterResult(value: unknown): NewsletterResult | null {
  const parsed = newsletterResultSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.status === "INVALID") {
    return Object.freeze({
      status: "INVALID",
      field: parsed.data.field,
    });
  }
  return Object.freeze({ status: parsed.data.status });
}
