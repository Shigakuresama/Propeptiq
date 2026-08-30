"use server";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { readServerEnv } from "@/env";

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
    "code" in error &&
    error.code === "email_not_confirmed"
  );
}

async function loadManagedAuth(environment: ReturnType<typeof readServerEnv>) {
  const { getNeonAuthForEnvironment } = await import("@/auth/neon-server");
  return getNeonAuthForEnvironment(environment);
}

async function requestVerificationCode(
  email: string,
): Promise<boolean> {
  const environment = readServerEnv();
  const auth = await loadManagedAuth(environment);
  if (!auth) return false;
  const { error } = await auth.emailOtp.sendVerificationOtp({
    email,
    type: "email-verification",
  });
  return !error;
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
  const auth = await loadManagedAuth(environment);
  if (!auth) return genericAuthError;

  let verified = false;
  try {
    const { data, error } = await auth.signUp.email(parsed.data);
    if (error || !data?.user) return genericAuthError;
    verified = data.user.emailVerified;
    if (!verified) {
      const sent = await requestVerificationCode(parsed.data.email);
      return verificationState(
        parsed.data.email,
        sent
          ? "Enter the verification code sent to your email address."
          : "Your account was created, but a verification code could not be sent. Request a new code to continue.",
      );
    }
  } catch {
    return genericAuthError;
  }
  if (verified) redirect(resolveAuthDestination(formData.get("returnTo")));
  return genericAuthError;
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
  const auth = await loadManagedAuth(environment);
  if (!auth) return genericAuthError;

  try {
    const { data, error } = await auth.signIn.email(parsed.data);
    if (error) {
      if (isUnverifiedEmailError(error)) {
        const sent = await requestVerificationCode(parsed.data.email);
        return verificationState(
          parsed.data.email,
          sent
            ? "Enter the verification code sent to your email address."
            : "Your email still needs verification, but a code could not be sent. Request a new code to continue.",
        );
      }
      return genericAuthError;
    }
    if (!data?.user) return genericAuthError;
    if (!data.user.emailVerified) {
      const sent = await requestVerificationCode(parsed.data.email);
      return verificationState(
        parsed.data.email,
        sent
          ? "Enter the verification code sent to your email address."
          : "Your email still needs verification, but a code could not be sent. Request a new code to continue.",
      );
    }
  } catch {
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
  const auth = await loadManagedAuth(environment);
  if (!auth) return genericAuthError;

  const destination = resolveAuthDestination(formData.get("returnTo"));
  try {
    const { error } = await auth.emailOtp.verifyEmail({
      email: email.data,
      otp: otp.data,
    });
    if (error) {
      return verificationState(email.data, "That code could not be verified. Request a new code and try again.");
    }
    const sessionResult = await auth.getSession({
      query: { disableCookieCache: "true" },
    });
    if (sessionResult.error || !sessionResult.data?.user.emailVerified) {
      return verificationState(
        email.data,
        "Your email was verified, but the session could not be refreshed. Use a different email to sign in again.",
      );
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
  try {
    await requestVerificationCode(email.data);
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
  const auth = await loadManagedAuth(readServerEnv());
  if (!auth) {
    return Object.freeze({
      status: "error",
      message: "We could not sign you out. Please try again.",
    });
  }
  try {
    const { error } = await auth.signOut();
    if (error) {
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
  let auth: Awaited<ReturnType<typeof loadManagedAuth>>;
  try {
    auth = await loadManagedAuth(environment);
  } catch {
    return genericPasswordResetUnavailable;
  }
  if (!auth || !environment.APP_ORIGIN) {
    return genericPasswordResetUnavailable;
  }

  const redirectUrl = new URL(
    "/reset-password",
    new URL(environment.APP_ORIGIN).origin,
  );
  redirectUrl.searchParams.set("returnTo", destination);
  try {
    await auth.requestPasswordReset({
      email: email.data,
      redirectTo: redirectUrl.toString(),
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
  const auth = await loadManagedAuth(environment);
  if (!auth) return genericPasswordResetError;
  try {
    const { data, error } = await auth.resetPassword({
      newPassword: passwords.data.password,
      token: token.data,
    });
    if (error || !data?.status) return genericPasswordResetError;
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
