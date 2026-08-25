import type { Metadata } from "next";
import Link from "next/link";

import { accountAccessReason } from "@/account/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { AccountFactsForm } from "@/components/account/account-facts-form";
import { AccountShell } from "@/components/account/account-shell";
import { CheckoutCartStatus } from "@/components/account/checkout-cart-status";

export const metadata: Metadata = { title: "Checkout" };

function ClosedState({ reason }: { reason: string }) {
  const signedOut = reason === "signed_out";
  return (
    <section className="record-card">
      <p className="eyebrow">Checkout closed</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">
        {signedOut ? "Sign in to continue." : "Verified account access is unavailable."}
      </h1>
      <p className="mt-5 text-base leading-7 text-muted-ink">
        {reason === "email_unverified"
          ? "The primary email is not currently verified. Complete verification with the identity provider before continuing."
          : reason === "account_unavailable"
            ? "The account database is disabled or unavailable, so checkout fails closed."
            : "Your product IDs and quantities remain saved in this browser while you sign in."}
      </p>
      {signedOut ? <Link href="/sign-in" className="action-primary mt-7 inline-flex min-h-12 items-center rounded-full px-6 font-semibold no-underline">Continue to sign in</Link> : null}
    </section>
  );
}

export default async function CheckoutPage() {
  const request = await getRequestIdentity();
  const repositories = getRequestRepositories(request);
  const reason = accountAccessReason(request);
  const principal = request.principal;
  const [account, attestation] =
    reason === null && repositories && principal
      ? await Promise.all([
          repositories.loadAccount(),
          repositories.loadCurrentAttestation(),
        ])
      : [null, null];
  return (
    <AccountShell localDriver={request.localDriver !== null}>
      <div className="mb-10 max-w-3xl">
        <p className="eyebrow">Verified account gate</p>
        <h1 className="mt-4 font-heading text-page leading-[0.92]">Checkout readiness</h1>
        <p className="mt-5 text-base leading-7 text-muted-ink">
          Account and attestation facts are verified here. Payment and order creation remain unavailable until the next commerce step.
        </p>
      </div>
      <div className="account-layout">
        <div>
          {reason ? <ClosedState reason={reason} /> : null}
          {!reason && (!repositories || !principal) ? <ClosedState reason="account_unavailable" /> : null}
          {!reason && repositories && principal && !attestation ? (
            <section className="error-record" role="alert">
              No single current attestation is available. Account activation and checkout fail closed.
            </section>
          ) : null}
          {!reason && repositories && principal && attestation && account?.status === "blocked" ? (
            <section className="error-record" role="alert">
              <h2 className="font-heading text-3xl">This buyer account is blocked.</h2>
              <p className="mt-3 text-base leading-7">Checkout and account changes are denied. Existing account and own-order reads remain available.</p>
              <Link href="/account/orders" className="record-link mt-5 inline-flex min-h-11 items-center">View your order history</Link>
            </section>
          ) : null}
          {!reason && repositories && principal && attestation && account?.status === "review" ? (
            <section className="warning-record" role="status">
              <h2 className="font-heading text-3xl">Account review is required.</h2>
              <p className="mt-3 text-base leading-7">Self-service updates cannot change this status. An authorized administrator must decide an existing review request.</p>
            </section>
          ) : null}
          {!reason && repositories && principal && attestation && account?.status !== "blocked" && account?.status !== "review" ? (
            <section className="record-card">
              <h2 className="font-heading text-3xl">{account ? "Refresh account facts" : "Complete your account"}</h2>
              <p className="mt-3 text-base leading-7 text-muted-ink">Every required fact is checked again on the server.</p>
              <div className="mt-8">
                <AccountFactsForm email={request.identity!.primaryEmail!} account={account} attestation={attestation} compact />
              </div>
              {account?.status === "active" && account.acceptedAttestationVersion === attestation.version ? (
                <div className="info-record mt-8" role="status">
                  <strong>Account gate complete.</strong> Payment session creation, destination totals, and order creation are not available in this step.
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <CheckoutCartStatus />
      </div>
    </AccountShell>
  );
}
