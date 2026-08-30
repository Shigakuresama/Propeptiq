import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { authRouteWithDestination, SIGN_IN_ROUTE } from "@/auth/routes";
import { getRequestIdentity } from "@/auth/server";
import {
  ManagedPasswordResetForm,
  ManagedPasswordResetRequestForm,
} from "@/components/account/managed-password-recovery";
import { EmptyState } from "@/components/design-system/archive-primitives";

export async function PasswordRecoveryEntry({
  kind,
  returnTo,
  token = null,
}: {
  kind: "request" | "reset";
  returnTo: string;
  token?: string | null;
}) {
  const request = await getRequestIdentity();
  if (
    request.environment.AUTH_MODE === "disabled" ||
    request.environment.LOCAL_TEST_DRIVER === "enabled" ||
    request.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION !== "verified"
  ) {
    return (
      <EmptyState
        action={(
          <Link
            className="record-link inline-flex min-h-11 items-center"
            href={authRouteWithDestination(SIGN_IN_ROUTE, returnTo)}
          >
            Return to sign in
          </Link>
        )}
        description="Managed password recovery is unavailable because secure recovery has not been fully configured."
        eyebrow="Account access unavailable"
        headingLevel="h1"
        icon={LockKeyhole}
        title="Password recovery is not configured."
      />
    );
  }

  return kind === "request" ? (
    <ManagedPasswordResetRequestForm returnTo={returnTo} />
  ) : (
    <ManagedPasswordResetForm returnTo={returnTo} token={token} />
  );
}
