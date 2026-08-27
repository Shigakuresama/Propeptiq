import { createHmac, timingSafeEqual } from "node:crypto";

import {
  hasProductionIdentity,
  type ServerEnv,
} from "@/config/env-schema";

export type VerifiedIdentity = Readonly<{
  clerkUserId: string;
  primaryEmail: string | null;
  emailVerifiedAt: string | null;
  mfaConfigured: boolean;
  secondFactorCompleted: boolean;
}>;

export function isVerifiedIdentityAt(
  identity: VerifiedIdentity,
  now: Date,
): boolean {
  const verifiedAt =
    identity.emailVerifiedAt === null
      ? Number.NaN
      : new Date(identity.emailVerifiedAt).getTime();
  return (
    Number.isFinite(now.getTime()) &&
    identity.clerkUserId === identity.clerkUserId.trim() &&
    identity.clerkUserId.length > 0 &&
    identity.primaryEmail !== null &&
    identity.primaryEmail === identity.primaryEmail.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.primaryEmail) &&
    Number.isFinite(verifiedAt) &&
    verifiedAt <= now.getTime()
  );
}

type ClerkAuthProjection = Readonly<{
  userId: string | null;
  factorVerificationAge: readonly number[] | null;
}>;

type ClerkUserProjection = Readonly<{
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: readonly Readonly<{
    id: string;
    emailAddress: string;
    verification: Readonly<{ status: string }> | null;
  }>[];
  twoFactorEnabled: boolean;
}>;

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCurrentSecondFactor(
  ages: readonly number[] | null,
): boolean {
  const secondFactorAge = ages?.[1];
  return (
    typeof secondFactorAge === "number" &&
    Number.isFinite(secondFactorAge) &&
    secondFactorAge >= 0
  );
}

export function projectClerkIdentity(
  auth: ClerkAuthProjection,
  user: ClerkUserProjection | null,
  now: Date = new Date(),
): VerifiedIdentity | null {
  if (!isNonBlank(auth.userId) || !user || user.id !== auth.userId) {
    return null;
  }

  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  const primaryEmail =
    primary && isNonBlank(primary.emailAddress)
      ? primary.emailAddress.trim().toLowerCase()
      : null;
  const emailVerified = primary?.verification?.status === "verified";

  return Object.freeze({
    clerkUserId: auth.userId,
    primaryEmail,
    emailVerifiedAt:
      emailVerified && Number.isFinite(now.getTime()) ? now.toISOString() : null,
    mfaConfigured: user.twoFactorEnabled === true,
    secondFactorCompleted: hasCurrentSecondFactor(auth.factorVerificationAge),
  });
}

export type IdentityLoaders = Readonly<{
  loadClerkIdentity: () => Promise<VerifiedIdentity | null>;
  loadLocalIdentity: () => Promise<VerifiedIdentity | null>;
}>;

export async function resolveServerIdentity(
  environment: ServerEnv,
  loaders: IdentityLoaders,
): Promise<VerifiedIdentity | null> {
  if (environment.LOCAL_TEST_DRIVER === "enabled") {
    if (
      environment.APP_ENV !== "local" ||
      hasProductionIdentity(environment) ||
      !environment.LOCAL_TEST_SECRET ||
      !environment.RATE_LIMIT_SECRET
    ) {
      throw new Error("Local test driver is not permitted by this environment");
    }
    return loaders.loadLocalIdentity();
  }
  if (environment.AUTH_MODE === "disabled") return null;
  return loaders.loadClerkIdentity();
}

function signatureFor(actorKey: string, secret: string): string {
  return createHmac("sha256", secret).update(actorKey).digest("hex");
}

export function signLocalActor(actorKey: string, secret: string): string {
  if (!isNonBlank(actorKey) || secret.length < 32) {
    throw new Error("Local actor signing input is invalid");
  }
  return `${actorKey}.${signatureFor(actorKey, secret)}`;
}

export function verifyLocalActor(
  signedActor: string,
  secret: string,
  allowedActorKeys: readonly string[],
): string | null {
  if (secret.length < 32) return null;
  const separator = signedActor.lastIndexOf(".");
  if (separator <= 0) return null;
  const actorKey = signedActor.slice(0, separator);
  const supplied = signedActor.slice(separator + 1);
  if (!allowedActorKeys.includes(actorKey) || !/^[a-f0-9]{64}$/.test(supplied)) {
    return null;
  }
  const expected = signatureFor(actorKey, secret);
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ? actorKey
    : null;
}
