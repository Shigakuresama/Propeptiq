import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { getRequestIdentity } from "@/auth/server";
import { LocalIdentityEntry } from "@/components/account/identity-entry";
import { ManagedAuthForm } from "@/components/account/managed-auth-form";
import { EmptyState } from "@/components/design-system/archive-primitives";

export async function AuthEntry({
  kind,
  returnTo,
}: {
  kind: "sign-in" | "sign-up";
  returnTo: string;
}) {
  const request = await getRequestIdentity();
  if (request.environment.LOCAL_TEST_DRIVER === "enabled" && request.localDriver) {
    return <LocalIdentityEntry actors={request.localDriver.actorOptions} kind={kind} />;
  }
  if (request.environment.AUTH_MODE === "disabled") {
    return (
      <EmptyState
        eyebrow="Account access unavailable"
        headingLevel="h1"
        icon={LockKeyhole}
        title={kind === "sign-in" ? "Sign-in is not configured." : "Account creation is not configured."}
        description={(
          <>
          The identity service is disabled. No credentials were collected and checkout remains closed.
          </>
        )}
        action={(
          <Link className="record-link inline-flex min-h-11 items-center" href="/cart">
            Return to your saved cart
          </Link>
        )}
      />
    );
  }
  return (
    <ManagedAuthForm
      initialVerificationEmail={
        request.identity?.emailVerifiedAt === null
          ? request.identity.primaryEmail ?? undefined
          : undefined
      }
      kind={kind}
      passwordRecoveryAvailable={
        request.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION ===
        "verified"
      }
      returnTo={returnTo}
    />
  );
}
