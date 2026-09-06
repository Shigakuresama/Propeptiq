import type { Metadata } from "next";
import { CircleAlert, ClipboardCheck, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { accountAccessReason } from "@/account/access";
import { authRouteWithDestination, SIGN_IN_ROUTE } from "@/auth/routes";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { isCheckoutPageRuntimeReady } from "@/commerce/server-runtime";
import { AccountFactsForm } from "@/components/account/account-facts-form";
import { AccountShell } from "@/components/account/account-shell";
import { CheckoutCartStatus } from "@/components/account/checkout-cart-status";
import { CheckoutForm } from "@/components/commerce/checkout-form";
import { DataLabel, Notice, RecordPanel } from "@/components/design-system/archive-primitives";

export const metadata: Metadata = { title: "Checkout" };

function ClosedState({ reason }: { reason: string }) {
  const signedOut = reason === "signed_out";
  return (
    <section aria-labelledby="checkout-closed-heading">
      <RecordPanel className="p-5 sm:p-7">
        <div className="grid size-11 place-items-center rounded-full border border-border bg-surface-recessed text-accent-readable">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </div>
        <DataLabel className="mt-5">Checkout unavailable</DataLabel>
        <h1 id="checkout-closed-heading" className="mt-4 font-heading text-page leading-[0.95]">
          {signedOut ? "Sign in to continue." : "We can’t verify your account right now."}
        </h1>
        <p className="mt-5 text-base leading-7 text-muted-ink">
          {reason === "email_unverified"
            ? "Verify your email before continuing."
            : reason === "account_unavailable"
              ? "We can’t load your account right now, so checkout is unavailable."
              : "Your cart will stay saved in this browser while you sign in."}
        </p>
        {signedOut ? <Link href={SIGN_IN_ROUTE} className="action-primary mt-7 inline-flex min-h-12 items-center rounded-full px-6 font-semibold no-underline">Continue to sign in</Link> : null}
      </RecordPanel>
    </section>
  );
}

export default async function CheckoutPage() {
  const request = await getRequestIdentity();
  const reason = accountAccessReason(request);
  if (reason === "signed_out") redirect(authRouteWithDestination(SIGN_IN_ROUTE, "/checkout"));
  const repositories = getRequestRepositories(request);
  const principal = request.principal;
  const [account, attestation] =
    reason === null && repositories && principal
      ? await Promise.all([
          repositories.loadAccount(),
          repositories.loadCurrentAttestation(),
        ])
      : [null, null];
  const checkoutEligible =
    account !== null &&
    attestation !== null &&
    account.acceptedAttestationVersion === attestation.version &&
    (account.status === "active" || account.status === "review");
  const buyerCheckoutReady =
    checkoutEligible && isCheckoutPageRuntimeReady(request);
  const browseOnlyPreview = request.environment.APP_ENV === "preview";
  return (
    <AccountShell
      authEnabled={request.environment.AUTH_MODE !== "disabled"}
      localDriver={request.localDriver !== null}
    >
      <header className="mb-10 grid gap-6 border-b border-border pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <DataLabel>Checkout</DataLabel>
          <h1 className="mt-4 font-heading text-page leading-[0.92]">Complete your checkout</h1>
          <p className="mt-5 text-base leading-7 text-muted-ink">
            Confirm your account, address, and current total before continuing to payment.
          </p>
        </div>
        <div className="flex items-center gap-3 text-accent-readable">
          <ClipboardCheck aria-hidden="true" className="size-5" />
          <p className="max-w-[24ch] text-sm font-semibold leading-6">Account → address → total</p>
        </div>
      </header>
      <div className="account-layout">
        <div className="grid gap-6">
          {browseOnlyPreview ? (
            <Notice title="Checkout is currently unavailable">
              This environment cannot accept orders or payments. You can review the synthetic catalog and your saved cart.
            </Notice>
          ) : null}
          {reason ? <ClosedState reason={reason} /> : null}
          {!reason && (!repositories || !principal) ? <ClosedState reason="account_unavailable" /> : null}
          {!reason && repositories && principal && !attestation ? (
            <Notice icon={CircleAlert} tone="danger" title="Checkout configuration unavailable">
              The required research-use agreement is unavailable, so account activation and checkout cannot continue.
            </Notice>
          ) : null}
          {!reason && repositories && principal && attestation && account?.status === "blocked" ? (
            <section className="error-record" role="alert">
              <h2 className="font-heading text-3xl">This buyer account is blocked.</h2>
              <p className="mt-3 text-base leading-7">Checkout and account changes are unavailable. You can still view your account and order history.</p>
              <Link href="/account/orders" className="record-link mt-5 inline-flex min-h-11 items-center">View your order history</Link>
            </section>
          ) : null}
          {!reason && repositories && principal && attestation && account?.status === "review" ? (
            <section className="warning-record" role="status">
              <h2 className="font-heading text-3xl">Account review is required.</h2>
              <p className="mt-3 text-base leading-7">You can’t change this status yourself. Your account must be reviewed before checkout can continue.</p>
            </section>
          ) : null}
          {!reason && repositories && principal && attestation && account?.status !== "blocked" && account?.status !== "review" ? (
            <RecordPanel className="p-5 sm:p-7">
              <DataLabel>Account details</DataLabel>
              <h2 className="mt-3 font-heading text-3xl">{account ? "Review your account" : "Complete your account"}</h2>
              <p className="mt-3 text-base leading-7 text-muted-ink">Review and confirm the required account details.</p>
              <div className="mt-8">
                <AccountFactsForm email={request.identity!.primaryEmail!} account={account} attestation={attestation} compact />
              </div>
              {account?.status === "active" && account.acceptedAttestationVersion === attestation.version && !browseOnlyPreview ? (
                <div className="info-record mt-8" role="status">
                  {buyerCheckoutReady ? (
                    <>
                      Your account is ready. Review your cart and address details below before continuing to payment.
                    </>
                  ) : (
                    <>
                      Your account is ready, but checkout is not available in this environment.
                    </>
                  )}
                </div>
              ) : null}
            </RecordPanel>
          ) : null}
          {buyerCheckoutReady ? <CheckoutForm syntheticLocal={request.localDriver !== null} /> : null}
        </div>
        <CheckoutCartStatus />
      </div>
    </AccountShell>
  );
}
