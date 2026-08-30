"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestManagedPasswordReset,
  resetManagedPassword,
  type ManagedAuthActionState,
} from "@/auth/actions";
import {
  authRouteWithDestination,
  FORGOT_PASSWORD_ROUTE,
  SIGN_IN_ROUTE,
} from "@/auth/routes";
import { managedAuthInputClassName } from "@/components/account/auth-form-styles";
import { Button } from "@/components/ui/button";

const initialState: ManagedAuthActionState = Object.freeze({
  status: "idle",
  message: "",
});

export function ManagedPasswordResetRequestForm({
  returnTo,
}: {
  returnTo: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestManagedPasswordReset,
    initialState,
  );

  return (
    <form action={formAction} className="grid max-w-md gap-5">
      <input name="returnTo" type="hidden" value={returnTo} />
      <div>
        <h1 className="font-heading text-3xl leading-tight text-ink">
          Reset your password
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-ink">
          Enter your account email. For privacy, the confirmation is the same
          whether or not an account exists.
        </p>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="reset-email">
          Email address
        </label>
        <input
          autoComplete="email"
          className={managedAuthInputClassName}
          id="reset-email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>

      {state.message ? (
        <p
          aria-live="polite"
          className={`text-sm leading-6 ${
            state.status === "error" ? "text-destructive" : "text-muted-ink"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Button
        className="min-h-11 w-full"
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending ? "Requesting…" : "Request reset link"}
      </Button>

      <Link
        className="record-link w-fit text-sm"
        href={authRouteWithDestination(SIGN_IN_ROUTE, returnTo)}
      >
        Back to sign in
      </Link>
    </form>
  );
}

export function ManagedPasswordResetForm({
  returnTo,
  token,
}: {
  returnTo: string;
  token: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    resetManagedPassword,
    initialState,
  );

  if (!token) {
    return (
      <div className="max-w-md">
        <h1 className="font-heading text-3xl leading-tight text-ink">
          This reset link is unavailable.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-ink">
          The link is invalid or expired. Request a new password-reset email to
          continue.
        </p>
        <Link
          className="record-link mt-6 inline-flex min-h-11 items-center"
          href={authRouteWithDestination(FORGOT_PASSWORD_ROUTE, returnTo)}
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid max-w-md gap-5">
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="token" type="hidden" value={token} />
      <div>
        <h1 className="font-heading text-3xl leading-tight text-ink">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-ink">
          Use at least 8 characters. After the reset, sign in again to continue
          to your private page.
        </p>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="new-password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className={managedAuthInputClassName}
          id="new-password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>

      <div className="grid gap-2">
        <label
          className="text-sm font-semibold text-ink"
          htmlFor="confirm-password"
        >
          Confirm new password
        </label>
        <input
          autoComplete="new-password"
          className={managedAuthInputClassName}
          id="confirm-password"
          maxLength={128}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
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
        {pending ? "Updating…" : "Set new password"}
      </Button>
      {state.status === "error" ? (
        <Link
          className="record-link w-fit text-sm"
          href={authRouteWithDestination(FORGOT_PASSWORD_ROUTE, returnTo)}
        >
          Request a new reset link
        </Link>
      ) : null}
    </form>
  );
}
