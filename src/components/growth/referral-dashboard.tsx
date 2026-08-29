"use client";

import { CircleCheck, Clock3, Copy, Undo2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CustomerReferralEnrollmentActionResult } from "@/growth/actions";
import type { OwnerGrowthSnapshot } from "@/growth/read-model";

type ReferralPolicyDisplay = Readonly<{
  attributionDays: number;
  referredDiscountBasisPoints: number;
  referredDiscountCapMinor: number;
  referrerPointsPerDollar: number;
  referrerRewardCapPoints: number;
}>;

export function ReferralDashboard(_props: Readonly<{
  referrals: OwnerGrowthSnapshot["referrals"];
  policy: ReferralPolicyDisplay | null;
  terms: Readonly<{ id: string; version: number }> | null;
  blocked: boolean;
  readOnly?: boolean;
  action: (formData: FormData) => Promise<CustomerReferralEnrollmentActionResult>;
}>) {
  const { referrals, policy, terms, blocked, readOnly = blocked, action } = _props;
  const initialState = Object.freeze({
    state: "idle" as const,
    code: "idle" as const,
    referralCode: null,
  });
  const [state, formAction, pending] = useActionState<
    CustomerReferralEnrollmentActionResult | typeof initialState,
    FormData
  >(async (_previous, formData) => action(formData), initialState);
  const errorRef = useRef<HTMLDivElement>(null);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (state.state === "error") errorRef.current?.focus();
  }, [state]);

  const activeCode = state.state === "success"
    ? state.referralCode
    : referrals.status === "active"
      ? referrals.code
      : null;
  const statusMessage = copyMessage || (state.state === "success"
    ? state.code === "idempotent"
      ? "Your stable referral code is active."
      : "Referral code activated."
    : "");
  const failureMessage = state.state === "error"
    ? state.code === "invalid"
      ? "Accept the exact current terms before activating your referral code."
      : state.code === "rate_limit"
        ? "Too many activation attempts were made. Please wait and try again."
        : "Referral code could not be activated safely. Please try again."
    : "";

  async function copyReferralLink() {
    if (!activeCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${activeCode}`);
      setCopyMessage("Referral link copied.");
    } catch {
      setCopyMessage("Referral link could not be copied.");
    }
  }

  const conversionState = {
    pending: { label: "Pending", Icon: Clock3 },
    qualified: { label: "Qualified", Icon: CircleCheck },
    reversed: { label: "Reversed", Icon: Undo2 },
  } as const;

  return (
    <div className="grid gap-8">
      {policy ? (
        <section className="record-card" aria-labelledby="referral-program-heading">
          <p className="eyebrow">Active server rules</p>
          <h2 id="referral-program-heading" className="mt-3 font-heading text-3xl">Referral program</h2>
          <ul className="mt-4 grid gap-2 text-base leading-7 text-muted-ink">
            <li>{policy.attributionDays}-day attribution window.</li>
            <li>The referred owner may receive {policy.referredDiscountBasisPoints / 100}% off eligible merchandise, capped at {(policy.referredDiscountCapMinor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.</li>
            <li>You may receive {policy.referrerPointsPerDollar} points per eligible merchandise dollar, capped at {policy.referrerRewardCapPoints} points.</li>
          </ul>
          <Link href="/rewards/terms" className="record-link mt-5 inline-flex min-h-11 items-center">Read current referral terms</Link>
        </section>
      ) : (
        <div className="empty-record">No active referral policy is currently available.</div>
      )}

      <section aria-labelledby="referral-summary-heading">
        <h2 id="referral-summary-heading" className="font-heading text-3xl">Private referral summary</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {([
            ["Attributed", referrals.counts.attributed],
            ["Pending", referrals.counts.pending],
            ["Qualified", referrals.counts.qualified],
            ["Reversed", referrals.counts.reversed],
            ["Reward points", referrals.rewardPointsTotal],
          ] as const).map(([label, value]) => (
            <div className="record-card" key={label}>
              <dt className="eyebrow">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {referrals.status === "revoked" && referrals.code ? (
        <div className="error-record">The prior referral code is revoked. Its historical records remain readable.</div>
      ) : null}

      {activeCode ? (
        <section className="record-card" aria-labelledby="owner-referral-code">
          <p className="eyebrow">Owner code</p>
          <h2 id="owner-referral-code" className="mt-3 font-heading text-3xl">Your referral link</h2>
          <p className="mt-4 break-all text-base leading-7 text-muted-ink">/r/{activeCode}</p>
          <Button type="button" variant="outline" className="mt-5 min-h-11" onClick={copyReferralLink}>
            <Copy aria-hidden="true" /> Copy referral link
          </Button>
        </section>
      ) : !readOnly && policy && terms ? (
        <form action={formAction} aria-label="Activate referral code" className="record-card grid gap-5">
          <input type="hidden" name="termsVersionId" value={terms.id} />
          <div>
            <label className="check-row">
              <input
                type="checkbox"
                name="acceptCurrentTerms"
                value="yes"
                required
                aria-required="true"
                aria-describedby={state.state === "error" ? "referral-terms-error" : undefined}
              />
              <span>I accept current referral terms version {terms.version}.</span>
            </label>
            {state.state === "error" ? (
              <p id="referral-terms-error" className="mt-2 text-base text-danger">Activation was not completed.</p>
            ) : null}
          </div>
          <Button type="submit" className="action-primary min-h-11" disabled={pending}>
            {pending ? "Activating…" : "Activate referral code"}
          </Button>
        </form>
      ) : blocked ? (
        <div className="error-record">Referral activation is unavailable while this account is blocked.</div>
      ) : readOnly ? (
        <div className="empty-record">Referral activation requires an active buyer account. Existing history remains readable.</div>
      ) : (
        <div className="empty-record">Current referral terms are unavailable, so activation is closed.</div>
      )}

      {state.state === "error" ? (
        <div ref={errorRef} className="error-record" role="alert" tabIndex={-1}>
          <strong>Referral code was not activated</strong>
          <p className="mt-2 text-base leading-7">{failureMessage}</p>
        </div>
      ) : statusMessage ? (
        <p className="info-record" role="status" aria-live="polite">{statusMessage}</p>
      ) : null}

      <section aria-labelledby="referral-history-heading">
        <h2 id="referral-history-heading" className="font-heading text-3xl">Conversion history</h2>
        {referrals.conversions.items.length === 0 ? (
          <div className="empty-record mt-5">No referral conversions exist for this account.</div>
        ) : (
          <ul className="mt-5 grid gap-4 p-0" aria-label="Referral conversions">
            {referrals.conversions.items.map((conversion) => {
              const { label, Icon } = conversionState[conversion.status];
              return (
                <li className="record-card min-w-0" key={`${conversion.reference}-${conversion.occurredAt}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden="true" className="size-5 text-moss" />{label}</p>
                    <time className="text-base text-muted-ink" dateTime={conversion.occurredAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(conversion.occurredAt))}</time>
                  </div>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><dt className="eyebrow">Reference</dt><dd className="mt-2 break-all text-base">{conversion.reference}</dd></div>
                    <div><dt className="eyebrow">Reward points</dt><dd className="mt-2 text-xl tabular-nums">{conversion.rewardPoints}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
