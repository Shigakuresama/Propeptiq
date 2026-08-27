import type { Metadata } from "next";
import Link from "next/link";

import { accountAccessReason } from "@/account/access";
import { SIGN_IN_ROUTE } from "@/auth/routes";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { AccountFactsForm } from "@/components/account/account-facts-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const request = await getRequestIdentity();
  const repositories = getRequestRepositories(request);
  const reason = accountAccessReason(request);
  if (reason || !repositories || !request.principal) {
    return (
      <section className="error-record" role="alert">
        <h1 className="font-heading text-page">Account unavailable</h1>
        <p className="mt-4 text-base leading-7">A current verified identity and configured account database are required.</p>
        {!request.identity ? <Link className="record-link mt-5 inline-flex min-h-11 items-center" href={SIGN_IN_ROUTE}>Sign in</Link> : null}
      </section>
    );
  }
  const [account, attestation] = await Promise.all([
    repositories.loadAccount(),
    repositories.loadCurrentAttestation(),
  ]);
  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Self account</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Verified account record</h1>
      <p className="mt-5 text-base leading-7 text-muted-ink">Only this authenticated owner can read this profile. Organization text never grants access.</p>
      <dl className="record-card mt-8 grid gap-5 sm:grid-cols-2">
        <div><dt className="eyebrow">Status</dt><dd className="mt-2 text-xl font-semibold capitalize">{account?.status ?? "Incomplete"}</dd></div>
        <div><dt className="eyebrow">Current attestation</dt><dd className="mt-2 text-xl font-semibold">{attestation ? `Version ${attestation.version}` : "Unavailable"}</dd></div>
        <div><dt className="eyebrow">Accepted version</dt><dd className="mt-2 text-xl font-semibold">{account?.acceptedAttestationVersion ?? "Not accepted"}</dd></div>
        <div><dt className="eyebrow">Research purpose</dt><dd className="mt-2 text-xl font-semibold">{account?.researchPurpose?.replaceAll("_", " ") ?? "Incomplete"}</dd></div>
      </dl>
      {account?.status === "blocked" ? (
        <div className="error-record mt-8"><strong>Blocked:</strong> account changes and checkout are denied, while this page and own orders remain readable.</div>
      ) : attestation ? (
        <section className="record-card mt-8">
          <h2 className="font-heading text-3xl">Update descriptive account facts</h2>
          <div className="mt-7"><AccountFactsForm email={request.identity!.primaryEmail!} account={account} attestation={attestation} /></div>
        </section>
      ) : (
        <div className="error-record mt-8">No single current attestation is configured, so updates fail closed.</div>
      )}
    </div>
  );
}
