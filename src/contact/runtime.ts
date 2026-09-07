import "server-only";

import { Resend } from "resend";

import type { ServerEnv } from "@/config/env-schema";
import { createPostgresContactDeliveryStore } from "@/db/repositories/contact-delivery-store";
import { createResendContactGateway, type ContactEmailPort } from "@/contact/resend-gateway";
import { createContactPostHandler } from "@/contact/server";
import { connectRuntimeDatabaseSession } from "@/db/runtime";
import { readServerEnv } from "@/env";

type ConfiguredContactEnv = ServerEnv & Readonly<{
  APP_ORIGIN: string;
  AUTH_EMAIL_DELIVERY_VERIFIED: "verified";
  CONTACT_RATE_LIMIT_MAX: number;
  CONTACT_RATE_LIMIT_WINDOW_SECONDS: number;
  CONTACT_SUPPORT_EMAIL: string;
  DATABASE_MODE: "test" | "live";
  EMAIL_MODE: "test" | "live";
  RATE_LIMIT_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
}>;

export function isContactRuntimeConfigured(env: ServerEnv): env is ConfiguredContactEnv {
  return env.EMAIL_MODE !== "disabled" && env.DATABASE_MODE !== "disabled" &&
    env.EMAIL_MODE === env.DATABASE_MODE && env.AUTH_EMAIL_DELIVERY_VERIFIED === "verified" &&
    Boolean(env.APP_ORIGIN && env.RESEND_API_KEY && env.RESEND_FROM &&
      env.CONTACT_SUPPORT_EMAIL && env.RATE_LIMIT_SECRET &&
      env.CONTACT_RATE_LIMIT_MAX && env.CONTACT_RATE_LIMIT_WINDOW_SECONDS);
}

export function createProductionContactPostHandler(): (request: Request) => Promise<Response> {
  const env = readServerEnv();
  if (!isContactRuntimeConfigured(env)) return createContactPostHandler();

  const resend = new Resend(env.RESEND_API_KEY);
  const emails: ContactEmailPort = {
    send: (message, options) => resend.emails.send({
      from: message.from,
      to: [...message.to],
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
    }, options),
  };
  return createContactPostHandler({
    appEnvironment: env.APP_ENV,
    appOrigin: env.APP_ORIGIN,
    connect: () => connectRuntimeDatabaseSession(env),
    createDeliveryStore: createPostgresContactDeliveryStore,
    gateway: createResendContactGateway({ emails, from: env.RESEND_FROM, supportRecipient: env.CONTACT_SUPPORT_EMAIL }),
    now: () => new Date(),
    rateLimit: env.CONTACT_RATE_LIMIT_MAX,
    rateLimitSecret: env.RATE_LIMIT_SECRET,
    rateLimitWindowSeconds: env.CONTACT_RATE_LIMIT_WINDOW_SECONDS,
  });
}
