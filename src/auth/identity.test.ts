import { describe, expect, it, vi } from "vitest";

import { parseServerEnv, type ServerEnv } from "@/config/env-schema";

import {
  isVerifiedIdentityAt,
  projectBetterAuthIdentity,
  projectClerkIdentity,
  resolveServerIdentity,
  signLocalActor,
  verifyLocalActor,
} from "./identity";

const clerkUser = {
  id: "user_clerk_verified",
  primaryEmailAddressId: "email_primary",
  emailAddresses: [
    {
      id: "email_primary",
      emailAddress: "researcher@example.test",
      verification: { status: "verified" },
    },
  ],
  twoFactorEnabled: true,
};
const verifiedLocalIdentity = {
  clerkUserId: "local-fixed-customer",
  primaryEmail: "local-customer@example.test",
  emailVerifiedAt: "2026-08-25T12:00:00.000Z",
  mfaConfigured: false,
  secondFactorCompleted: false,
} as const;

describe("server identity boundary", () => {
  it("returns no identity in disabled mode without invoking Clerk or local loaders", async () => {
    const loadExternalIdentity = vi.fn();
    const loadLocalIdentity = vi.fn();

    await expect(
      resolveServerIdentity(parseServerEnv({}), {
        loadExternalIdentity,
        loadLocalIdentity,
      }),
    ).resolves.toBeNull();
    expect(loadExternalIdentity).not.toHaveBeenCalled();
    expect(loadLocalIdentity).not.toHaveBeenCalled();
  });

  it("rejects a production local-driver identity before loading any fixed principal", async () => {
    const loadLocalIdentity = vi.fn(async () => verifiedLocalIdentity);
    const unsafe = {
      ...parseServerEnv({}),
      APP_ENV: "production",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
      RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
    } as ServerEnv;

    await expect(
      resolveServerIdentity(unsafe, {
        loadExternalIdentity: vi.fn(),
        loadLocalIdentity,
      }),
    ).rejects.toThrow(/local test driver/i);
    expect(loadLocalIdentity).not.toHaveBeenCalled();
  });

  it("projects only server-confirmed Clerk identity and current-session MFA facts", () => {
    expect(
      projectClerkIdentity(
        {
          userId: "user_clerk_verified",
          factorVerificationAge: [4, 0],
        },
        clerkUser,
        new Date("2026-08-25T12:00:00.000Z"),
      ),
    ).toEqual({
      clerkUserId: "user_clerk_verified",
      primaryEmail: "researcher@example.test",
      emailVerifiedAt: "2026-08-25T12:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
    });
  });

  it("projects a verified Better Auth user while keeping staff MFA evidence fail-closed", () => {
    expect(
      projectBetterAuthIdentity(
        {
          id: "neon-user-verified",
          email: " Researcher@Example.test ",
          emailVerified: true,
        },
        new Date("2026-08-30T07:00:00.000Z"),
      ),
    ).toEqual({
      clerkUserId: "neon-user-verified",
      primaryEmail: "researcher@example.test",
      emailVerifiedAt: "2026-08-30T07:00:00.000Z",
      mfaConfigured: false,
      secondFactorCompleted: false,
    });
  });

  it("does not mark an unverified Better Auth email as verified", () => {
    const identity = projectBetterAuthIdentity({
      id: "neon-user-unverified",
      email: "researcher@example.test",
      emailVerified: false,
    });

    expect(identity?.emailVerifiedAt).toBeNull();
    expect(identity && isVerifiedIdentityAt(identity, new Date())).toBe(false);
  });

  it.each([null, [3, -1], [3, Number.NaN], [3, Number.POSITIVE_INFINITY]])(
    "fails current-session MFA closed for second-factor age %j",
    (factorVerificationAge) => {
      expect(
        projectClerkIdentity(
          { userId: "user_clerk_verified", factorVerificationAge },
          clerkUser,
          new Date("2026-08-25T12:00:00.000Z"),
        )?.secondFactorCompleted,
      ).toBe(false);
    },
  );

  it("fails closed for missing identity, mismatched user, or unverified primary email", () => {
    expect(projectClerkIdentity({ userId: null, factorVerificationAge: null }, clerkUser)).toBeNull();
    expect(
      projectClerkIdentity(
        { userId: "different", factorVerificationAge: [1, 0] },
        clerkUser,
      ),
    ).toBeNull();
    expect(
      projectClerkIdentity(
        { userId: clerkUser.id, factorVerificationAge: [1, 0] },
        {
          ...clerkUser,
          emailAddresses: [
            {
              ...clerkUser.emailAddresses[0]!,
              verification: { status: "unverified" },
            },
          ],
        },
      )?.emailVerifiedAt,
    ).toBeNull();
  });

  it("accepts only an allowlisted actor key with an untampered HMAC signature", () => {
    const secret = "task5-local-driver-secret-at-least-32-chars";
    const signed = signLocalActor("customer", secret);

    expect(verifyLocalActor(signed, secret, ["customer", "admin"])).toBe("customer");
    expect(verifyLocalActor(`${signed}x`, secret, ["customer", "admin"])).toBeNull();
    expect(verifyLocalActor(signLocalActor("outsider", secret), secret, ["customer", "admin"])).toBeNull();
  });
});
