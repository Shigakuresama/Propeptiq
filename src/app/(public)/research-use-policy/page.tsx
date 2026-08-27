import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Research-Use Policy",
  description: "The canonical public research-use restrictions and purchaser responsibilities.",
};

export default function ResearchUsePolicyPage() {
  return (
    <PageTransition>
      <article className="site-container pb-20">
        <PageIntro
          eyebrow="Canonical policy"
          title="Research-use restrictions and purchaser responsibilities."
          description="This page is the sole public policy authority for the storefront. Product and destination availability remain record-specific and are reloaded at checkout."
        />
        <div className="policy-grid">
          <section aria-labelledby="restriction-heading" className="record-card">
            <h2 id="restriction-heading" className="font-heading text-3xl text-ink">Research-use restriction</h2>
            <p className="mt-5 leading-7 text-muted-ink">
              Materials made available through this site are offered only for legitimate laboratory, analytical, educational, or other nonclinical research. They are not for human or veterinary use.
            </p>
            <p className="mt-4 leading-7 text-muted-ink">
              The storefront does not provide dosing, administration, reconstitution, treatment, outcome, or clinical-use guidance.
            </p>
          </section>
          <section aria-labelledby="responsibilities-heading" className="record-card">
            <h2 id="responsibilities-heading" className="font-heading text-3xl text-ink">Purchaser responsibilities</h2>
            <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-muted-ink">
              <li>Accurate purchaser information, account details, and the current checkout attestation are required.</li>
              <li>Account sign-in and acceptance of the current checkout attestation are required before a hosted payment session can be created.</li>
              <li>Use catalog records only for a legitimate laboratory or research purpose.</li>
              <li>Review current product, destination, availability, tax, shipping, and provider results before submitting checkout.</li>
              <li>Publication, a successful build, or synthetic local-test success does not establish universal legal, provider, destination, tax, shipping, fulfillment, or launch approval.</li>
            </ul>
          </section>
        </div>
        <p className="info-record mt-8 max-w-[74ch]">
          The anonymous cart retains only product IDs and quantities. At checkout, the server re-resolves authoritative account, attestation, catalog, price, promotion, destination, inventory, tax, shipping, and provider facts.
        </p>
        <Link className="record-link mt-8 inline-block" href="/catalog">Continue to catalog</Link>
      </article>
    </PageTransition>
  );
}
