import "server-only";

import { Resend } from "resend";

import type { ServerEnv } from "@/config/env-schema";
import {
  connectRuntimeDatabaseSession,
  type RuntimeDatabaseSession,
} from "@/db/runtime";
import { readServerEnv } from "@/env";
import {
  isApprovedNewsletterPrivacyHref,
  newsletterConfiguration,
  type ApprovedNewsletterPrivacyHref,
} from "@/lib/site-content";
import {
  createNewsletterAttemptGate,
} from "@/newsletter/attempt-gate";
import {
  createResendNewsletterGateway,
  type ResendContactsCreatePort,
} from "@/newsletter/resend-gateway";
import { createNewsletterPostHandler } from "@/newsletter/server";

export type NewsletterRuntimeConfiguration = Readonly<{
  enabled: boolean;
  privacyHref: ApprovedNewsletterPrivacyHref | null;
}>;

export type NewsletterRuntimeDependencies = Readonly<{
  configuration: NewsletterRuntimeConfiguration;
  connectDatabase: (environment: ServerEnv) => Promise<RuntimeDatabaseSession>;
  createContactsPort: (apiKey: string) => ResendContactsCreatePort;
  now: () => Date;
  readEnvironment: () => ServerEnv;
}>;

function unconfiguredHandler(): (request: Request) => Promise<Response> {
  return createNewsletterPostHandler();
}

function approvedCodeConfiguration(
  configuration: NewsletterRuntimeConfiguration,
): ApprovedNewsletterPrivacyHref | null {
  try {
    if (configuration.enabled !== true) return null;
    return isApprovedNewsletterPrivacyHref(configuration.privacyHref)
      ? configuration.privacyHref
      : null;
  } catch {
    return null;
  }
}

function assertEnabledEnvironment(environment: ServerEnv): asserts environment is
  ServerEnv & Readonly<{
    NEWSLETTER_MODE: "test" | "live";
    NEWSLETTER_RESEND_API_KEY: string;
    NEWSLETTER_RESEND_TOPIC_ID: string;
    NEWSLETTER_RATE_LIMIT_MAX: number;
    NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: number;
    RATE_LIMIT_SECRET: string;
  }> {
  if (
    (environment.NEWSLETTER_MODE !== "test" &&
      environment.NEWSLETTER_MODE !== "live") ||
    environment.DATABASE_MODE !== environment.NEWSLETTER_MODE ||
    typeof environment.NEWSLETTER_RESEND_API_KEY !== "string" ||
    environment.NEWSLETTER_RESEND_API_KEY.length === 0 ||
    typeof environment.NEWSLETTER_RESEND_TOPIC_ID !== "string" ||
    typeof environment.NEWSLETTER_RATE_LIMIT_MAX !== "number" ||
    typeof environment.NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS !== "number" ||
    typeof environment.RATE_LIMIT_SECRET !== "string" ||
    environment.NEWSLETTER_RESEND_API_KEY === environment.RESEND_API_KEY
  ) {
    throw new Error("Newsletter runtime configuration is invalid.");
  }
}

export function createNewsletterRuntimePostHandler(
  dependencies: NewsletterRuntimeDependencies,
): (request: Request) => Promise<Response> {
  const privacyHref = approvedCodeConfiguration(dependencies.configuration);
  if (privacyHref === null) return unconfiguredHandler();

  const environment = dependencies.readEnvironment();
  if (environment.NEWSLETTER_MODE === "disabled") {
    return unconfiguredHandler();
  }
  assertEnabledEnvironment(environment);

  let contacts: ResendContactsCreatePort;
  try {
    contacts = dependencies.createContactsPort(
      environment.NEWSLETTER_RESEND_API_KEY,
    );
  } catch {
    throw new Error("Newsletter runtime configuration is invalid.");
  }

  const gateway = createResendNewsletterGateway({
    contacts,
    topicId: environment.NEWSLETTER_RESEND_TOPIC_ID,
  });
  const attemptGate = createNewsletterAttemptGate({
    appEnvironment: environment.APP_ENV,
    connect: () => dependencies.connectDatabase(environment),
    limit: environment.NEWSLETTER_RATE_LIMIT_MAX,
    now: dependencies.now,
    rateLimitSecret: environment.RATE_LIMIT_SECRET,
    windowSeconds: environment.NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS,
  });

  return createNewsletterPostHandler({
    attemptGate,
    gateway,
    privacyHref,
  });
}

function createProductionContactsPort(apiKey: string): ResendContactsCreatePort {
  const resend = new Resend(apiKey);
  return Object.freeze({
    create(input) {
      return resend.contacts.create({
        email: input.email,
        topics: input.topics.map((topic) => ({
          id: topic.id,
          subscription: topic.subscription,
        })),
      });
    },
  });
}

export function createProductionNewsletterPostHandler(): (
  request: Request,
) => Promise<Response> {
  return createNewsletterRuntimePostHandler({
    configuration: newsletterConfiguration,
    connectDatabase: connectRuntimeDatabaseSession,
    createContactsPort: createProductionContactsPort,
    now: () => new Date(),
    readEnvironment: readServerEnv,
  });
}
