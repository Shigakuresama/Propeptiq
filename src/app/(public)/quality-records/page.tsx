import type { Metadata } from "next";
import Link from "next/link";

import { getPublicCatalog } from "@/catalog/server";
import { DemoNotice } from "@/components/site/demo-notice";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";

export const metadata: Metadata = {
  title: "Quality Records",
  description: "Public records projected only from released lots and active public COAs.",
};

export default async function QualityRecordsPage() {
  const catalog = await getPublicCatalog();
  const isSyntheticDemo = catalog.source === "synthetic-demo";

  return (
    <PageTransition>
      {isSyntheticDemo ? <DemoNotice /> : null}
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Quality records"
          title="Released-lot records with approved public evidence."
          description="Only records linked to a released lot and an active public COA appear here. No absent laboratory, supplier, accreditation, or analytical fact is inferred."
        />
        {catalog.qualityRecords.length === 0 ? (
          <section className="empty-record">
            <h2 className="font-heading text-section text-ink">No public quality records are currently available.</h2>
            <p className="mt-4 max-w-[62ch] leading-7 text-muted-ink">
              The empty state does not imply that testing occurred or that a record is pending.
            </p>
            <Link className="record-link mt-6 inline-block" href="/catalog">Return to catalog</Link>
          </section>
        ) : (
          <ol className="space-y-5">
            {catalog.qualityRecords.map((record) => (
              <li className="record-card" id={`record-${record.id}`} key={record.id}>
                {isSyntheticDemo ? <p className="demo-label">Synthetic demo quality record</p> : null}
                <h2 className="mt-4 font-heading text-3xl text-ink">{record.productName}</h2>
                <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-ink">Lot/batch</dt>
                    <dd className="mt-1 tabular-nums text-muted-ink">{record.lotCode}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Analytical method</dt>
                    <dd className="mt-1 text-muted-ink">{record.analyticalMethod ?? "No approved public record"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">COA state</dt>
                    <dd className="mt-1 text-muted-ink">
                      {isSyntheticDemo ? "Public synthetic demo record" : "Public record available"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Issued</dt>
                    <dd className="mt-1 tabular-nums text-muted-ink">{record.issuedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(record.issuedAt)) : "No approved public date"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PageTransition>
  );
}
