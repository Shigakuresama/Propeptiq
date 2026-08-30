import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { getRequestIdentity } from "@/auth/server";
import { LocalIdentityEntry } from "@/components/account/identity-entry";
import { EmptyState } from "@/components/design-system/archive-primitives";

export async function AuthEntry({ kind }: { kind: "sign-in" | "sign-up" }) {
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
  const clerk = await import("@clerk/nextjs");
  const Component = kind === "sign-in" ? clerk.SignIn : clerk.SignUp;
  const path = kind === "sign-in" ? "/sign-in" : "/sign-up";
  return (
    <div className="flex min-h-[32rem] justify-center">
      <Component routing="path" path={path} forceRedirectUrl="/checkout" />
    </div>
  );
}
