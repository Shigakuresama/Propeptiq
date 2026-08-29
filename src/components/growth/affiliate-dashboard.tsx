"use client";

import { CircleCheck, CircleX, Clock3, PauseCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { AffiliateApplicationActionResult } from "@/growth/actions";
import type { OwnerGrowthSnapshot } from "@/growth/read-model";

type AffiliatePolicyDisplay = Readonly<{
  attributionDays: number;
  reorderWindowDays: number;
  approvalDelayDays: number;
  payoutThresholdMinor: number;
  currency: string;
}>;

export function AffiliateDashboard(_props: Readonly<{
  affiliate: OwnerGrowthSnapshot["affiliate"];
  policy: AffiliatePolicyDisplay | null;
  terms: Readonly<{ id: string; version: number }> | null;
  verifiedEmail: string;
  blocked: boolean;
  readOnly?: boolean;
  action: (formData: FormData) => Promise<AffiliateApplicationActionResult>;
}>) {
  const { affiliate, policy, terms, verifiedEmail, blocked, readOnly = blocked, action } = _props;
  const initialState = Object.freeze({
    state: "idle" as const,
    code: "idle" as const,
    application: null,
  });
  const [state, formAction, pending] = useActionState<
    AffiliateApplicationActionResult | typeof initialState,
    FormData
  >(async (_previous, formData) => action(formData), initialState);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.state === "error") errorRef.current?.focus();
  }, [state]);

  const currentAffiliate = affiliate ?? (state.state === "success" && state.application
    ? Object.freeze({
        publicCode: state.application.publicCode,
        status: state.application.status,
        publicChannel: state.application.publicChannel,
        promotionMethod: state.application.promotionMethod,
        attributedCount: 0,
        commissionTotalsMinor: Object.freeze({ pending: 0, approved: 0, paid: 0, reversed: 0 }),
        payoutTotalsMinor: Object.freeze({ pending: 0, paid: 0 }),
      })
    : null);
  const statusDisplay = {
    pending: { label: "Pending", Icon: Clock3, detail: "The application is awaiting owner review." },
    active: { label: "Active", Icon: CircleCheck, detail: "The partner record is active under the current program." },
    rejected: { label: "Rejected", Icon: CircleX, detail: "The application was not approved. Its history remains readable." },
    suspended: { label: "Suspended", Icon: PauseCircle, detail: "The partner record is suspended. Its history remains readable." },
  } as const;
  const failureMessage = state.state === "error"
    ? state.code === "invalid"
      ? "Review the public channel, promotion method, and exact current terms acceptance."
      : state.code === "conflict"
        ? "This application conflicts with an existing owner record. Refresh before trying again."
        : state.code === "rate_limit"
          ? "Too many application attempts were made. Please wait and try again."
          : "The partner application could not be submitted safely. Please try again."
    : "";
  const hasFieldErrors = state.state === "error" && state.code === "invalid";
  const money = (amountMinor: number) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: policy?.currency ?? "USD",
  }).format(amountMinor / 100);

  return (
    <div className="grid gap-8">
      {policy ? (
        <section className="record-card" aria-labelledby="partner-rules-heading">
          <p className="eyebrow">Active server rules</p>
          <h2 id="partner-rules-heading" className="mt-3 font-heading text-3xl">Partner program</h2>
          <ul className="mt-4 grid gap-2 text-base leading-7 text-muted-ink">
            <li>{policy.attributionDays}-day attribution window.</li>
            <li>Eligible reorder window: {policy.reorderWindowDays} days.</li>
            <li>Commission approval eligibility begins {policy.approvalDelayDays} days after delivery.</li>
            <li>Recorded payout threshold: {money(policy.payoutThresholdMinor)}. Payout processing remains outside this dashboard.</li>
          </ul>
          <Link href="/partners/terms" className="record-link mt-5 inline-flex min-h-11 items-center">Read current partner terms</Link>
        </section>
      ) : (
        <div className="empty-record">No active partner policy is currently available.</div>
      )}

      {currentAffiliate ? (() => {
        const { label, Icon, detail } = statusDisplay[currentAffiliate.status];
        return (
          <>
            <section className="record-card" aria-labelledby="partner-status-heading">
              <p className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden="true" className="size-5 text-moss" />{label}</p>
              <h2 id="partner-status-heading" className="mt-3 font-heading text-3xl">Private partner record</h2>
              <p className="mt-4 text-base leading-7 text-muted-ink">{detail}</p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><dt className="eyebrow">Public channel</dt><dd className="mt-2 break-all text-base">{currentAffiliate.publicChannel}</dd></div>
                <div><dt className="eyebrow">Promotion method</dt><dd className="mt-2 text-base capitalize">{currentAffiliate.promotionMethod}</dd></div>
                <div><dt className="eyebrow">Private code</dt><dd className="mt-2 break-all text-base">{currentAffiliate.publicCode}</dd></div>
                <div><dt className="eyebrow">Attributed records</dt><dd className="mt-2 text-xl tabular-nums">{currentAffiliate.attributedCount}</dd></div>
              </dl>
            </section>
            <section aria-labelledby="partner-financial-heading">
              <h2 id="partner-financial-heading" className="font-heading text-3xl">Commission and payout history</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["Pending commission", currentAffiliate.commissionTotalsMinor.pending],
                  ["Approved commission", currentAffiliate.commissionTotalsMinor.approved],
                  ["Paid commission", currentAffiliate.commissionTotalsMinor.paid],
                  ["Reversed commission", currentAffiliate.commissionTotalsMinor.reversed],
                  ["Pending payout record", currentAffiliate.payoutTotalsMinor.pending],
                  ["Paid payout record", currentAffiliate.payoutTotalsMinor.paid],
                ] as const).map(([labelText, amount]) => (
                  <div className="record-card" key={labelText}>
                    <dt className="eyebrow">{labelText}</dt>
                    <dd className="mt-2 text-2xl font-semibold tabular-nums">{money(amount)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        );
      })() : !readOnly && policy && terms ? (
        <form action={formAction} aria-label="Apply for partner program" className="record-card grid gap-5">
          <input type="hidden" name="termsVersionId" value={terms.id} />
          <div>
            <label className="form-label" htmlFor="partner-verified-email">Verified email</label>
            <input id="partner-verified-email" className="form-input" value={verifiedEmail} readOnly />
            <p className="mt-2 text-base leading-7 text-muted-ink">Inherited from the authenticated server identity and not submitted by the browser.</p>
          </div>
          <div>
            <label className="form-label" htmlFor="partner-public-channel">Public channel URL or handle</label>
            <input
              id="partner-public-channel"
              name="publicChannel"
              className="form-input"
              maxLength={200}
              required
              aria-required="true"
              aria-invalid={hasFieldErrors ? "true" : undefined}
              aria-describedby={hasFieldErrors ? "partner-channel-help partner-channel-error" : "partner-channel-help"}
            />
            <p id="partner-channel-help" className="mt-2 text-base leading-7 text-muted-ink">Enter one public URL or handle used for neutral research promotion.</p>
            {hasFieldErrors ? <p id="partner-channel-error" className="mt-2 text-base text-danger">Review this bounded public channel.</p> : null}
          </div>
          <div>
            <label className="form-label" htmlFor="partner-promotion-method">Promotion method</label>
            <select
              id="partner-promotion-method"
              name="promotionMethod"
              className="form-input"
              required
              aria-required="true"
              aria-invalid={hasFieldErrors ? "true" : undefined}
              aria-describedby={hasFieldErrors ? "partner-method-error" : undefined}
              defaultValue=""
            >
              <option value="" disabled>Select one method</option>
              <option value="website">Website</option>
              <option value="social">Social channel</option>
              <option value="email">Email publication</option>
              <option value="other">Other public channel</option>
            </select>
            {hasFieldErrors ? <p id="partner-method-error" className="mt-2 text-base text-danger">Select the applicable promotion method.</p> : null}
          </div>
          <div>
            <label className="check-row" htmlFor="partner-terms-acceptance">
              <input
                id="partner-terms-acceptance"
                type="checkbox"
                name="acceptCurrentTerms"
                value="yes"
                required
                aria-required="true"
                aria-invalid={hasFieldErrors ? "true" : undefined}
                aria-describedby={hasFieldErrors ? "partner-terms-error" : undefined}
              />
              <span>I accept current partner terms version {terms.version}.</span>
            </label>
            {hasFieldErrors ? <p id="partner-terms-error" className="mt-2 text-base text-danger">Accept the exact current partner terms.</p> : null}
          </div>
          <Button type="submit" className="action-primary min-h-11" disabled={pending}>{pending ? "Submitting…" : "Submit partner application"}</Button>
        </form>
      ) : blocked ? (
        <div className="error-record">Partner applications are unavailable while this account is blocked.</div>
      ) : readOnly ? (
        <div className="empty-record">Partner applications require an active buyer account. Existing history remains readable.</div>
      ) : (
        <div className="empty-record">Current partner terms are unavailable, so applications are closed.</div>
      )}

      {state.state === "error" ? (
        <div ref={errorRef} className="error-record" role="alert" tabIndex={-1}>
          <strong>Partner application was not submitted</strong>
          <p className="mt-2 text-base leading-7">{failureMessage}</p>
          {hasFieldErrors ? (
            <ul className="mt-3 grid gap-1 text-base">
              <li><a className="record-link inline-flex min-h-11 items-center" href="#partner-public-channel">Public channel</a></li>
              <li><a className="record-link inline-flex min-h-11 items-center" href="#partner-promotion-method">Promotion method</a></li>
              <li><a className="record-link inline-flex min-h-11 items-center" href="#partner-terms-acceptance">Current terms</a></li>
            </ul>
          ) : null}
        </div>
      ) : state.state === "success" ? (
        <p className="info-record" role="status" aria-live="polite">
          {state.code === "idempotent" ? "The existing partner application remains current." : "Partner application submitted."}
        </p>
      ) : null}
    </div>
  );
}
