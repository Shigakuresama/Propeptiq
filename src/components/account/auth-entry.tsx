import Link from "next/link";

import { getRequestIdentity } from "@/auth/server";
import { LocalIdentityEntry } from "@/components/account/identity-entry";

export async function AuthEntry({ kind }: { kind: "sign-in" | "sign-up" }) {
  const request = await getRequestIdentity();
  if (request.environment.LOCAL_TEST_DRIVER === "enabled" && request.localDriver) {
    return <LocalIdentityEntry actors={request.localDriver.actorOptions} kind={kind} />;
  }
  if (request.environment.AUTH_MODE === "disabled") {
    return (
      <section className="record-card mx-auto max-w-2xl">
        <p className="eyebrow">Account access unavailable</p>
        <h1 className="mt-5 font-heading text-page leading-[0.95]">
          {kind === "sign-in" ? "Sign-in is not configured." : "Account creation is not configured."}
        </h1>
        <p className="mt-5 text-base leading-7 text-muted-ink">
          The identity service is disabled. No credentials were collected and checkout remains closed.
        </p>
        <Link className="record-link mt-7 inline-block min-h-11 py-3" href="/cart">
          Return to your saved cart
        </Link>
      </section>
    );
  }
  const clerk = await import("@clerk/nextjs");
  const Component = kind === "sign-in" ? clerk.SignIn : clerk.SignUp;
  const path = kind === "sign-in" ? "/sign-in" : "/sign-up";
  return (
    <div className="mx-auto flex max-w-2xl justify-center">
      <Component routing="path" path={path} forceRedirectUrl="/checkout" />
    </div>
  );
}
