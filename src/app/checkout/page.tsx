import type { Metadata } from "next";
import { CircleAlert, ClipboardCheck, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { accountAccessReason } from "@/account/access";
import { SIGN_IN_ROUTE } from "@/auth/routes";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { getPublicCatalog } from "@/catalog/server";
import { isBuyerCheckoutRuntimeReady } from "@/commerce/server-runtime";
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
        <DataLabel className="mt-5">Checkout closed</DataLabel>
        <h1 id="checkout-closed-heading" className="mt-4 font-heading text-page leading-[0.95]">
          {signedOut ? "Sign in to continue." : "Verified account access is unavailable."}
        </h1>
        <p className="mt-5 text-base leading-7 text-muted-ink">
          {reason === "email_unverified"
            ? "The primary email is not currently verified. Complete verification with the identity provider before continuing."
            : reason === "account_unavailable"
              ? "The account database is disabled or unavailable, so checkout fails closed."
              : "Your product IDs and quantities remain saved in this browser while you sign in."}
        </p>
        {signedOut ? <Link href={SIGN_IN_ROUTE} className="action-primary mt-7 inline-flex min-h-12 items-center rounded-full px-6 font-semibold no-underline">Continue to sign in</Link> : null}
      </RecordPanel>
    </section>
  );
}

export default async function CheckoutPage() {
  const request = await getRequestIdentity();
  const reason = accountAccessReason(request);
  if (reason === "signed_out") redirect(SIGN_IN_ROUTE);
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
    checkoutEligible && isBuyerCheckoutRuntimeReady(request);
  const browseOnlyPreview = request.environment.APP_ENV === "preview";
  const catalog = buyerCheckoutReady ? await getPublicCatalog() : null;
  const promotionOptions = catalog?.promotions
    .filter((promotion) => promotion.kind === "discount")
    .map((promotion) => ({ id: promotion.id, name: promotion.name })) ?? [];
  return (
    <AccountShell
      authEnabled={request.environment.AUTH_MODE !== "disabled"}
      localDriver={request.localDriver !== null}
    >
      <header className="mb-10 grid gap-6 border-b border-border pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <DataLabel>Verified account gate</DataLabel>
          <h1 className="mt-4 font-heading text-page leading-[0.92]">Checkout readiness</h1>
          <p className="mt-5 text-base leading-7 text-muted-ink">
            Account and attestation facts are verified here before current destination, product, promotion, shipping, tax, and payment-session facts are resolved.
          </p>
        </div>
        <div className="flex items-center gap-3 text-accent-readable">
          <ClipboardCheck aria-hidden="true" className="size-5" />
          <p className="max-w-[24ch] text-sm font-semibold leading-6">Identity → destination → authoritative total</p>
        </div>
      </header>
      <div className="account-layout">
        <div className="grid gap-6">
          {browseOnlyPreview ? (
            <Notice title="Browse-only Preview">
              Shipping, tax, and payment-session creation are unavailable in this Preview. Browse the synthetic catalog without submitting checkout requests.
            </Notice>
          ) : null}
          {reason ? <ClosedState reason={reason} /> : null}
          {!reason && (!repositories || !principal) ? <ClosedState reason="account_unavailable" /> : null}
          {!reason && repositories && principal && !attestation ? (
            <Notice icon={CircleAlert} tone="danger" title="Checkout configuration unavailable">
              No single current attestation is available. Account activation and checkout fail closed.
            </Notice>
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
            <RecordPanel className="p-5 sm:p-7">
              <DataLabel>Account checkpoint</DataLabel>
              <h2 className="mt-3 font-heading text-3xl">{account ? "Refresh account facts" : "Complete your account"}</h2>
              <p className="mt-3 text-base leading-7 text-muted-ink">Every required fact is checked again on the server.</p>
              <div className="mt-8">
                <AccountFactsForm email={request.identity!.primaryEmail!} account={account} attestation={attestation} compact />
              </div>
              {account?.status === "active" && account.acceptedAttestationVersion === attestation.version && !browseOnlyPreview ? (
                <div className="info-record mt-8" role="status">
                  {buyerCheckoutReady ? (
                    <>
                      <strong>Account gate complete.</strong> Authoritative checkout is available below. Every request fact is resolved again before a hosted payment session can open.
                    </>
                  ) : (
                    <>
                      <strong>Checkout remains unavailable.</strong> Account facts are current, but buyer shipping, tax, and payment-session capabilities are not enabled in this environment.
                    </>
                  )}
                </div>
              ) : null}
            </RecordPanel>
          ) : null}
          {buyerCheckoutReady ? <CheckoutForm promotions={promotionOptions} syntheticLocal={request.localDriver !== null} /> : null}
        </div>
        <CheckoutCartStatus />
      </div>
    </AccountShell>
  );
}
