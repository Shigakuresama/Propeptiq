"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import {
  resendVerificationCode,
  signInWithEmail,
  signUpWithEmail,
  verifyEmailOtp,
  type ManagedAuthActionState,
} from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { ManagedSignOutForm } from "@/components/account/managed-sign-out-form";
import { managedAuthInputClassName } from "@/components/account/auth-form-styles";
import {
  authRouteWithDestination,
  FORGOT_PASSWORD_ROUTE,
} from "@/auth/routes";

const initialState: ManagedAuthActionState = Object.freeze({
  status: "idle",
  message: "",
});

export function resolveManagedOtpMessage({
  initialMessage,
  lastAction,
  resendPending,
  resendMessage,
  verifyPending,
  verifyMessage,
}: {
  initialMessage: string;
  lastAction: "resend" | "verify" | null;
  resendPending: boolean;
  resendMessage: string;
  verifyPending: boolean;
  verifyMessage: string;
}): string {
  if (lastAction === "verify") {
    return verifyPending ? "Verifying the code…" : verifyMessage || initialMessage;
  }
  if (lastAction === "resend") {
    return resendPending ? "Requesting a new code…" : resendMessage || initialMessage;
  }
  return initialMessage;
}

function ManagedOtpForm({
  email,
  initialMessage,
  returnTo,
}: {
  email: string;
  initialMessage: string;
  returnTo: string;
}) {
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyEmailOtp,
    initialState,
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendVerificationCode,
    initialState,
  );
  const [lastAction, setLastAction] = useState<"resend" | "verify" | null>(null);
  const message = resolveManagedOtpMessage({
    initialMessage,
    lastAction,
    resendPending,
    resendMessage: resendState.message,
    verifyPending,
    verifyMessage: verifyState.message,
  });

  return (
    <div className="max-w-md">
      <h1 className="font-heading text-3xl leading-tight text-ink">
        Verify your email
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-ink">
        Enter the numeric code sent to <strong className="font-semibold text-ink">{email}</strong>.
      </p>

      <form
        action={verifyAction}
        className="mt-7 grid gap-5"
        onSubmit={() => setLastAction("verify")}
      >
        <input name="email" type="hidden" value={email} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="email-otp">
            Verification code
          </label>
          <input
            autoComplete="one-time-code"
            autoFocus
            className={managedAuthInputClassName}
            id="email-otp"
            inputMode="numeric"
            maxLength={10}
            name="otp"
            pattern="[0-9]*"
            required
            type="text"
          />
        </div>
        <Button
          className="min-h-11 w-full"
          disabled={verifyPending}
          size="lg"
          type="submit"
        >
          {verifyPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>

      <form
        action={resendAction}
        className="mt-3"
        onSubmit={() => setLastAction("resend")}
      >
        <input name="email" type="hidden" value={email} />
        <Button
          className="min-h-11 w-full"
          disabled={resendPending}
          size="lg"
          type="submit"
          variant="outline"
        >
          {resendPending ? "Requesting…" : "Request a new code"}
        </Button>
      </form>

      <p aria-live="polite" className="mt-4 text-sm leading-6 text-muted-ink">
        {message}
      </p>
      <div className="mt-5 border-t border-border pt-5 text-sm">
        <ManagedSignOutForm
          label="Use a different email"
          returnTo={returnTo}
          variant="link"
        />
      </div>
    </div>
  );
}

export function ManagedAuthForm({
  initialVerificationEmail,
  kind,
  passwordRecoveryAvailable = false,
  returnTo,
}: {
  initialVerificationEmail?: string | undefined;
  kind: "sign-in" | "sign-up";
  passwordRecoveryAvailable?: boolean;
  returnTo: string;
}) {
  const action = kind === "sign-in" ? signInWithEmail : signUpWithEmail;
  const [state, formAction, pending] = useActionState(action, initialState);
  const verificationEmail = initialVerificationEmail ?? state.email;

  if (verificationEmail) {
    return (
      <ManagedOtpForm
        email={verificationEmail}
        initialMessage={
          state.message || "Your account exists, but its email must be verified before private records are available."
        }
        returnTo={returnTo}
      />
    );
  }

  return (
    <form action={formAction} className="grid max-w-md gap-5">
      <input name="returnTo" type="hidden" value={returnTo} />
      <div>
        <h1 className="font-heading text-3xl leading-tight text-ink">
          {kind === "sign-in" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-ink">
          {kind === "sign-in"
            ? "Use the verified email connected to your private records."
            : "Email verification is required before private records or checkout become available."}
        </p>
      </div>

      {kind === "sign-up" ? (
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="auth-name">
            Name
          </label>
          <input
            autoComplete="name"
            className={managedAuthInputClassName}
            id="auth-name"
            maxLength={100}
            name="name"
            required
            type="text"
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="auth-email">
          Email address
        </label>
        <input
          autoComplete="email"
          className={managedAuthInputClassName}
          id="auth-email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="auth-password">
          Password
        </label>
        <input
          autoComplete={kind === "sign-in" ? "current-password" : "new-password"}
          className={managedAuthInputClassName}
          id="auth-password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
        {kind === "sign-up" ? (
          <p className="text-xs leading-5 text-muted-ink">Use at least 8 characters.</p>
        ) : passwordRecoveryAvailable ? (
          <Link
            className="record-link w-fit text-sm"
            href={authRouteWithDestination(FORGOT_PASSWORD_ROUTE, returnTo)}
          >
            Forgot password?
          </Link>
        ) : null}
      </div>

      {state.message ? (
        <p aria-live="polite" className="text-sm leading-6 text-destructive">
          {state.message}
        </p>
      ) : null}

      <Button
        className="min-h-11 w-full"
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending
          ? kind === "sign-in"
            ? "Signing in…"
            : "Creating account…"
          : kind === "sign-in"
            ? "Sign in securely"
            : "Create account"}
      </Button>
    </form>
  );
}
