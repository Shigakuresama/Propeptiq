import { z } from "zod";

export const contactLimits = Object.freeze({
  name: 100,
  email: 254,
  subject: 160,
  message: 5_000,
  orderReference: 100,
  honeypot: 200,
});

export const contactInputSchema = z.object({
  requestId: z.uuid(),
  name: z.string().trim().min(1, "Enter your name.").max(contactLimits.name),
  email: z.string().trim().toLowerCase().max(contactLimits.email).pipe(z.email("Enter a valid email address.")),
  subject: z.string().trim().min(1, "Enter a subject.").max(contactLimits.subject),
  message: z.string().trim().min(1, "Enter a message.").max(contactLimits.message),
  orderReference: z.string().trim().max(contactLimits.orderReference).optional().default(""),
  website: z.string().max(contactLimits.honeypot).optional().default(""),
}).strict();

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactField = "name" | "email" | "subject" | "message" | "orderReference" | "request";
export type ContactResult =
  | Readonly<{ status: "ACCEPTED" }>
  | Readonly<{ status: "INVALID"; field: ContactField }>
  | Readonly<{ status: "UNAVAILABLE" }>
  | Readonly<{ status: "RATE_LIMITED" }>;

export function parseContactInput(value: unknown):
  | Readonly<{ success: true; data: ContactInput }>
  | Readonly<{ success: false; field: ContactField }> {
  const parsed = contactInputSchema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  const first = parsed.error.issues[0]?.path[0];
  const field = ["name", "email", "subject", "message", "orderReference"].includes(String(first))
    ? first as ContactField
    : "request";
  return { success: false, field };
}
