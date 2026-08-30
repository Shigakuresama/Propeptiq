import { Archive, FileCheck2, FileSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getPublicCatalog } from "@/catalog/server";
import {
  DataLabel,
  EmptyState,
  Metric,
  RecordPanel,
} from "@/components/design-system/archive-primitives";
import { DemoNotice } from "@/components/site/demo-notice";
import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";
import { Button } from "@/components/ui/button";

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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] xl:items-center xl:gap-16">
          <PageIntro
            eyebrow="Quality records"
            title="Released-lot records with approved public evidence."
            description="Only records linked to a released lot and an active public COA appear here. No absent laboratory, supplier, accreditation, or analytical fact is inferred."
          />
          <RecordPanel className="mb-12 p-6 sm:p-8 xl:my-24">
            <div className="flex items-center gap-3">
              <Archive aria-hidden="true" className="size-5 text-moss" />
              <DataLabel>Archive manifest</DataLabel>
            </div>
            <Metric
              className="mt-6 border-y border-border py-6"
              detail="Released-lot entries with active public COA projections"
              label="Public records"
              value={catalog.qualityRecords.length}
            />
            <p className="mt-5 text-sm leading-6 text-muted-ink">
              A missing archive entry is not represented as pending evidence or an implied
              quality result.
            </p>
          </RecordPanel>
        </div>
        {catalog.qualityRecords.length === 0 ? (
          <EmptyState
            action={
              <Button
                asChild
                className="h-11 rounded-full px-5"
                variant="outline"
              >
                <Link href="/catalog">Return to catalog</Link>
              </Button>
            }
            description="The empty state does not imply that testing occurred or that a record is pending."
            eyebrow="Archive state"
            icon={FileSearch}
            title="No public quality records are currently available."
          />
        ) : (
          <section aria-labelledby="quality-record-index-heading">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
              <div>
                <DataLabel>Document index</DataLabel>
                <h2
                  id="quality-record-index-heading"
                  className="mt-3 font-heading text-3xl text-ink sm:text-4xl"
                >
                  Public record archive
                </h2>
              </div>
              <p className="text-base tabular-nums text-muted-ink">
                {catalog.qualityRecords.length} record
                {catalog.qualityRecords.length === 1 ? "" : "s"}
              </p>
            </div>

            <ol aria-label="Public quality record index" className="grid gap-5">
              {catalog.qualityRecords.map((record, index) => (
                <li id={`record-${record.id}`} key={record.id}>
                  <RecordPanel className="overflow-hidden p-0">
                    <div className="grid gap-4 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-8">
                      <div>
                        {isSyntheticDemo ? (
                          <p className="demo-label">Synthetic demo quality record</p>
                        ) : (
                          <DataLabel>
                            Quality record {String(index + 1).padStart(2, "0")}
                          </DataLabel>
                        )}
                        <h3 className="mt-3 text-balance font-heading text-3xl text-ink sm:text-4xl">
                          {record.productName}
                        </h3>
                      </div>
                      <div className="grid size-11 place-items-center rounded-full border border-moss/30 bg-moss-soft text-accent-readable">
                        <FileCheck2 aria-hidden="true" className="size-5" />
                      </div>
                    </div>

                    <dl className="grid border-t border-border bg-surface-recessed sm:grid-cols-2 xl:grid-cols-4">
                      <div className="border-b border-border p-5 sm:border-r xl:border-b-0">
                        <dt className="data-label">Lot/batch</dt>
                        <dd className="mt-2 break-words text-base font-medium tabular-nums text-ink">
                          {record.lotCode}
                        </dd>
                      </div>
                      <div className="border-b border-border p-5 xl:border-b-0 xl:border-r">
                        <dt className="data-label">Analytical method</dt>
                        <dd className="mt-2 text-base leading-7 text-ink">
                          {record.analyticalMethod ?? "No approved public record"}
                        </dd>
                      </div>
                      <div className="border-b border-border p-5 sm:border-r sm:border-b-0">
                        <dt className="data-label">COA state</dt>
                        <dd className="mt-2 text-base leading-7 text-ink">
                          {isSyntheticDemo
                            ? "Public synthetic demo record"
                            : "Public record available"}
                        </dd>
                      </div>
                      <div className="p-5">
                        <dt className="data-label">Issued</dt>
                        <dd className="mt-2 text-base tabular-nums text-ink">
                          {record.issuedAt
                            ? new Intl.DateTimeFormat("en-US", {
                                dateStyle: "medium",
                              }).format(new Date(record.issuedAt))
                            : "No approved public date"}
                        </dd>
                      </div>
                    </dl>
                  </RecordPanel>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
