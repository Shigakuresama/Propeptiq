"use server";

import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { readServerEnv } from "@/env";
import { consumeAuthActionRateLimit } from "@/auth/action-rate-limit";

import {
  authRouteWithDestination,
  resolveAuthDestination,
  SIGN_IN_ROUTE,
} from "./routes";
import { LOCAL_ACTOR_COOKIE } from "./server";

export type ManagedAuthActionState = Readonly<{
  status: "idle" | "error" | "success" | "verification";
  message: string;
  email?: string;
}>;

const emailSchema = z.string().trim().max(254).pipe(z.email());
const passwordSchema = z.string().min(8).max(128);
const nameSchema = z.string().trim().min(1).max(100);

const genericAuthError = Object.freeze({
  status: "error",
  message: "We could not complete that identity request. Please try again.",
} as const satisfies ManagedAuthActionState);

const genericPasswordResetRequest = Object.freeze({
  status: "success",
  message:
    "If an account exists for this email, a password reset link has been requested. Check your inbox.",
} as const satisfies ManagedAuthActionState);

const genericPasswordResetError = Object.freeze({
  status: "error",
  message: "This reset link could not be used. Request a new link and try again.",
} as const satisfies ManagedAuthActionState);

const genericPasswordResetUnavailable = Object.freeze({
  status: "error",
  message: "Password reset is temporarily unavailable. Please try again later.",
} as const satisfies ManagedAuthActionState);

function isUnverifiedEmailError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "body" in error &&
    typeof error.body === "object" &&
    error.body !== null &&
    "code" in error.body &&
    error.body.code === "EMAIL_NOT_VERIFIED"
  );
}

async function loadBetterAuth(environment: ReturnType<typeof readServerEnv>) {
  const { getBetterAuthForEnvironment } = await import(
    "@/auth/better-auth-server"
  );
  return getBetterAuthForEnvironment(environment);
}

async function requestVerificationCode(
  email: string,
): Promise<boolean> {
  const environment = readServerEnv();
  const auth = await loadBetterAuth(environment);
  if (!auth) return false;
  const result = await auth.api.sendVerificationOTP({
    body: { email, type: "email-verification" },
    headers: await headers(),
  });
  return result.success === true;
}

function verificationState(
  email: string,
  message = "Enter the verification code sent to your email address.",
): ManagedAuthActionState {
  return Object.freeze({ status: "verification", email, message });
}

export async function signUpWithEmail(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  const parsed = z
    .object({
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return Object.freeze({
      status: "error",
      message: "Enter a name, a valid email address, and a password of at least 8 characters.",
    });
  }

  const environment = readServerEnv();
  if (!(await consumeAuthActionRateLimit(environment, "signUp"))) {
    return genericAuthError;
  }
  const auth = await loadBetterAuth(environment);
  if (!auth) return genericAuthError;

  try {
    const result = await auth.api.signUpEmail({
      body: parsed.data,
      headers: await headers(),
    });
    if (!result?.user) return genericAuthError;
    if (!result.user.emailVerified) {
      return verificationState(
        parsed.data.email,
        "Enter the verification code from your email. If it does not arrive, request a new code.",
      );
    }
  } catch {
    return genericAuthError;
  }
  redirect(resolveAuthDestination(formData.get("returnTo")));
}

export async function signInWithEmail(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) return genericAuthError;

  const environment = readServerEnv();
  if (!(await consumeAuthActionRateLimit(environment, "signIn"))) {
    return genericAuthError;
  }
  const auth = await loadBetterAuth(environment);
  if (!auth) return genericAuthError;

  try {
    const result = await auth.api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });
    if (!result?.user || !result.user.emailVerified) {
      await requestVerificationCode(parsed.data.email);
      return verificationState(
        parsed.data.email,
        "If this address can receive a verification code, one has been requested. Check your inbox.",
      );
    }
  } catch (error) {
    if (isUnverifiedEmailError(error)) {
      try {
        await requestVerificationCode(parsed.data.email);
      } catch {
        // Keep the public state independent of account and delivery status.
      }
      return verificationState(
        parsed.data.email,
        "If this address can receive a verification code, one has been requested. Check your inbox.",
      );
    }
    return genericAuthError;
  }
  redirect(resolveAuthDestination(formData.get("returnTo")));
}

export async function verifyEmailOtp(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const otp = z.string().trim().regex(/^\d{4,10}$/u).safeParse(formData.get("otp"));
  if (!email.success || !otp.success) {
    return email.success
      ? verificationState(email.data, "Enter the numeric code from your email.")
      : genericAuthError;
  }

  const environment = readServerEnv();
  if (!(await consumeAuthActionRateLimit(environment, "verifyEmail"))) {
    return verificationState(
      email.data,
      "That code could not be verified. Request a new code and try again.",
    );
  }
  const auth = await loadBetterAuth(environment);
  if (!auth) return genericAuthError;

  const destination = resolveAuthDestination(formData.get("returnTo"));
  try {
    const result = await auth.api.verifyEmailOTP({
      body: { email: email.data, otp: otp.data },
      headers: await headers(),
    });
    if (
      result.status !== true ||
      !result.token ||
      !result.user.emailVerified
    ) {
      return verificationState(email.data, "That code could not be verified. Request a new code and try again.");
    }
  } catch {
    return verificationState(email.data, "That code could not be verified. Request a new code and try again.");
  }
  redirect(destination);
}

export async function resendVerificationCode(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return genericAuthError;
  const environment = readServerEnv();
  try {
    if (
      await consumeAuthActionRateLimit(environment, "resendVerification")
    ) {
      await requestVerificationCode(email.data);
    }
  } catch {
    // Keep the public response identical so this action cannot be used to
    // distinguish registered, unverified, or unknown email addresses.
  }
  return verificationState(
    email.data,
    "If this address can receive a verification code, a new one has been requested. Check your inbox and try again later if it does not arrive.",
  );
}

export async function signOutManagedIdentity(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  void _previousState;
  const auth = await loadBetterAuth(readServerEnv());
  if (!auth) {
    return Object.freeze({
      status: "error",
      message: "We could not sign you out. Please try again.",
    });
  }
  try {
    const result = await auth.api.signOut({ headers: await headers() });
    if (!result.success) {
      return Object.freeze({
        status: "error",
        message: "We could not sign you out. Please try again.",
      });
    }
  } catch {
    return Object.freeze({
      status: "error",
      message: "We could not sign you out. Please try again.",
    });
  }
  const requestedReturn = formData.get("returnTo");
  redirect(
    typeof requestedReturn === "string"
      ? authRouteWithDestination(SIGN_IN_ROUTE, requestedReturn)
      : SIGN_IN_ROUTE,
  );
}

export async function requestManagedPasswordReset(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  void _previousState;
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) {
    return Object.freeze({
      status: "error",
      message: "Enter a valid email address.",
    });
  }

  const environment = readServerEnv();
  if (
    environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION !== "verified"
  ) {
    return genericPasswordResetUnavailable;
  }
  const destination = resolveAuthDestination(formData.get("returnTo"));
  if (!environment.APP_ORIGIN) {
    return genericPasswordResetUnavailable;
  }
  if (
    !(await consumeAuthActionRateLimit(environment, "requestPasswordReset"))
  ) {
    return genericPasswordResetRequest;
  }
  let auth: Awaited<ReturnType<typeof loadBetterAuth>>;
  try {
    auth = await loadBetterAuth(environment);
  } catch {
    return genericPasswordResetUnavailable;
  }
  if (!auth) {
    return genericPasswordResetUnavailable;
  }

  const redirectUrl = new URL(
    "/reset-password",
    new URL(environment.APP_ORIGIN).origin,
  );
  redirectUrl.searchParams.set("returnTo", destination);
  try {
    await auth.api.requestPasswordReset({
      body: {
        email: email.data,
        redirectTo: redirectUrl.toString(),
      },
      headers: await headers(),
    });
  } catch {
    // The public response must remain identical for known and unknown emails,
    // including provider errors, so this endpoint cannot enumerate accounts.
  }
  return genericPasswordResetRequest;
}

export async function resetManagedPassword(
  _previousState: ManagedAuthActionState,
  formData: FormData,
): Promise<ManagedAuthActionState> {
  void _previousState;
  const passwords = z
    .object({
      password: passwordSchema,
      confirmPassword: passwordSchema,
    })
    .refine((value) => value.password === value.confirmPassword)
    .safeParse({
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });
  if (!passwords.success) {
    return Object.freeze({
      status: "error",
      message: "Enter matching passwords of at least 8 characters.",
    });
  }

  const token = z
    .string()
    .trim()
    .min(16)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .safeParse(formData.get("token"));
  if (!token.success) return genericPasswordResetError;

  const environment = readServerEnv();
  if (
    environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION !== "verified"
  ) {
    return genericPasswordResetUnavailable;
  }
  if (!(await consumeAuthActionRateLimit(environment, "resetPassword"))) {
    return genericPasswordResetError;
  }
  const auth = await loadBetterAuth(environment);
  if (!auth) return genericPasswordResetError;
  try {
    const result = await auth.api.resetPassword({
      body: {
        newPassword: passwords.data.password,
        token: token.data,
      },
      headers: await headers(),
    });
    if (!result.status) return genericPasswordResetError;
  } catch {
    return genericPasswordResetError;
  }
  redirect(
    authRouteWithDestination(
      SIGN_IN_ROUTE,
      resolveAuthDestination(formData.get("returnTo")),
    ),
  );
}

export async function signInWithFixedActor(formData: FormData): Promise<never> {
  await connection();
  const environment = readServerEnv();
  if (
    environment.LOCAL_TEST_DRIVER !== "enabled" ||
    environment.APP_ENV !== "local" ||
    !environment.LOCAL_TEST_SECRET
  ) {
    throw new Error("Fixed local sign-in is unavailable");
  }
  const actorKey = formData.get("actorKey");
  if (typeof actorKey !== "string") throw new Error("Fixed actor is required");
  const { getLocalTestDriver } = await import("local-auth-driver");
  const signed = getLocalTestDriver().signActor(
    actorKey,
    environment.LOCAL_TEST_SECRET,
  );
  if (!signed) throw new Error("Unknown fixed actor");
  (await cookies()).set(LOCAL_ACTOR_COOKIE, signed, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 60 * 60,
  });
  redirect("/checkout");
}

export async function signOutLocalActor(): Promise<never> {
  const environment = readServerEnv();
  if (environment.LOCAL_TEST_DRIVER !== "enabled") {
    throw new Error("Fixed local sign-out is unavailable");
  }
  (await cookies()).delete(LOCAL_ACTOR_COOKIE);
  redirect(SIGN_IN_ROUTE);
}
