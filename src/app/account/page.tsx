import type { Metadata } from "next";
import { CircleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { accountAccessReason } from "@/account/access";
import { SIGN_IN_ROUTE } from "@/auth/routes";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { AccountFactsForm } from "@/components/account/account-facts-form";
import { DataLabel, Notice, RecordPanel } from "@/components/design-system/archive-primitives";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const request = await getRequestIdentity();
  const repositories = getRequestRepositories(request);
  const reason = accountAccessReason(request);
  if (reason || !repositories || !request.principal) {
    return (
      <section className="max-w-4xl">
        <DataLabel>Private account</DataLabel>
        <h1 className="mt-4 font-heading text-page">Account unavailable</h1>
        <Notice className="mt-6" icon={CircleAlert} tone="danger" title="Verified access required">
          <p>A current verified identity and configured account database are required.</p>
          {!request.identity ? <Link className="record-link mt-4 inline-flex min-h-11 items-center" href={SIGN_IN_ROUTE}>Sign in</Link> : null}
        </Notice>
      </section>
    );
  }
  const [account, attestation] = await Promise.all([
    repositories.loadAccount(),
    repositories.loadCurrentAttestation(),
  ]);
  return (
    <div className="max-w-4xl">
      <DataLabel>Self account</DataLabel>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Verified account record</h1>
      <p className="mt-5 text-base leading-7 text-muted-ink">Only this authenticated owner can read this profile. Organization text never grants access.</p>
      <RecordPanel className="mt-8 overflow-hidden">
        <dl className="grid sm:grid-cols-2">
          <div className="border-b border-border p-5 sm:border-r sm:p-6"><dt className="data-label">Status</dt><dd className="mt-3"><span className="status-pill capitalize">{account?.status ?? "Incomplete"}</span></dd></div>
          <div className="border-b border-border p-5 sm:p-6"><dt className="data-label">Current attestation</dt><dd className="mt-3 text-xl font-semibold">{attestation ? `Version ${attestation.version}` : "Unavailable"}</dd></div>
          <div className="border-b border-border p-5 sm:border-b-0 sm:border-r sm:p-6"><dt className="data-label">Accepted version</dt><dd className="mt-3 text-xl font-semibold">{account?.acceptedAttestationVersion ?? "Not accepted"}</dd></div>
          <div className="p-5 sm:p-6"><dt className="data-label">Research purpose</dt><dd className="mt-3 text-xl font-semibold capitalize">{account?.researchPurpose?.replaceAll("_", " ") ?? "Incomplete"}</dd></div>
        </dl>
      </RecordPanel>
      {account?.status === "blocked" ? (
        <Notice className="mt-8" icon={CircleAlert} tone="danger" title="Account changes are blocked">
          Account changes and checkout are denied, while this page and own orders remain readable.
        </Notice>
      ) : attestation ? (
        <RecordPanel className="mt-8 p-5 sm:p-8">
          <div className="flex gap-3">
            <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent-readable" />
            <div>
              <DataLabel>Verified profile</DataLabel>
              <h2 className="mt-3 font-heading text-3xl">Update descriptive account facts</h2>
              <p className="mt-3 text-base leading-7 text-muted-ink">Required identity and attestation facts are checked again on the server when saved.</p>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8"><AccountFactsForm email={request.identity!.primaryEmail!} account={account} attestation={attestation} /></div>
        </RecordPanel>
      ) : (
        <Notice className="mt-8" icon={CircleAlert} tone="danger" title="Account updates unavailable">
          No single current attestation is configured, so updates fail closed.
        </Notice>
      )}
    </div>
  );
}
