"use client";

import { useActionState } from "react";

import { saveBuyerAccount, type AccountActionState } from "@/account/actions";
import type { AccountSummary } from "@/account/account-read";
import { DataLabel } from "@/components/design-system/archive-primitives";
import { Button } from "@/components/ui/button";

const initialState: AccountActionState = { state: "idle", code: "idle", message: "" };

export function AccountFactsForm({
  email,
  account,
  attestation,
  compact = false,
}: {
  email: string;
  account: AccountSummary | null;
  attestation: Readonly<{ version: number; policyText: string }>;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(saveBuyerAccount, initialState);
  const requiresAttestation =
    account?.acceptedAttestationVersion !== attestation.version;
  return (
    <form action={action} className="grid gap-8" aria-label="Verified account facts">
      <section className="record-panel-recessed p-4 sm:p-5" aria-labelledby="identity-facts-heading">
        <DataLabel>Identity and purpose</DataLabel>
        <h3 id="identity-facts-heading" className="mt-3 font-heading text-2xl">Verified buyer facts</h3>
        <div className="mt-6 grid gap-6">
          <div>
            <label className="form-label" htmlFor="verified-email">Verified email</label>
            <input id="verified-email" className="form-input" value={email} readOnly />
            <p className="mt-2 text-base leading-6 text-muted-ink">
              This value is read from the server identity provider and cannot be edited here.
            </p>
          </div>
          <label className="check-row bg-canvas">
            <input
              type="checkbox"
              name="ageConfirmed21Plus"
              value="yes"
              defaultChecked={account?.ageConfirmedAt !== null && account !== null}
            />
            <span>I confirm that I am at least 21 years old.</span>
          </label>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="research-purpose">Research purpose</label>
              <select
                id="research-purpose"
                name="researchPurpose"
                className="form-input"
                defaultValue={account?.researchPurpose ?? ""}
                required
              >
                <option value="" disabled>Select one structured purpose</option>
                <option value="in_vitro">In-vitro laboratory research</option>
                <option value="analytical">Analytical reference work</option>
                <option value="educational">Educational laboratory work</option>
                <option value="other_laboratory">Other legitimate laboratory work</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="organization-name">Organization name (optional)</label>
              <input
                id="organization-name"
                name="organizationName"
                className="form-input"
                maxLength={160}
                defaultValue={account?.organizationName ?? ""}
                autoComplete="organization"
              />
              <p className="mt-2 text-base leading-6 text-muted-ink">
                Descriptive only. It does not grant ownership, membership, or staff access.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="attestation-heading">
        <div className="record-row">
          <p className="eyebrow">Current attestation · version {attestation.version}</p>
          <h3 id="attestation-heading" className="mt-3 font-heading text-2xl">Research-use attestation</h3>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7">{attestation.policyText}</p>
        </div>
        <label className="check-row mt-4">
          <input
            type="checkbox"
            name="acceptCurrentAttestation"
            value="yes"
            defaultChecked={!requiresAttestation}
          />
          <span>
            {requiresAttestation
              ? `I have reviewed and accept attestation version ${attestation.version}.`
              : `Attestation version ${attestation.version} is already accepted.`}
          </span>
        </label>
      </section>
      {state.state !== "idle" ? (
        <div
          className={state.state === "success" ? "info-record" : "error-record"}
          role={state.state === "error" ? "alert" : "status"}
          aria-labelledby="account-form-result"
        >
          <p id="account-form-result" className="font-semibold">
            {state.state === "success" ? "Account facts saved" : "Account facts were not saved"}
          </p>
          <p className="mt-2 text-base leading-6">{state.message}</p>
        </div>
      ) : null}
      <Button type="submit" className={`action-primary ${compact ? "w-full" : "w-full sm:w-auto"}`} disabled={pending}>
        {pending ? "Saving verified facts…" : account ? "Update account facts" : "Complete verified account"}
      </Button>
    </form>
  );
}
