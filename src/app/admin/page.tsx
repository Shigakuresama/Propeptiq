import { ArrowUpRight, PanelsTopLeft } from "lucide-react";
import Link from "next/link";

import { adminGate, adminResources } from "@/admin/access";
import { getRequestIdentity } from "@/auth/server";
import { DataLabel, EmptyState, Metric, RecordPanel } from "@/components/design-system/archive-primitives";

export default async function AdminPage() {
  const request = await getRequestIdentity();
  const gate = adminGate(request);
  if (!gate.allowed) return null;
  const capabilities = new Set(request.principal!.capabilities);
  const resources = adminResources.filter((resource) => capabilities.has(resource.capability));
  return (
    <section>
      <DataLabel>One-administrator operations</DataLabel>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Administration</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
        This current MFA session may act only within active database-backed capabilities. Every sensitive command is rate limited, version checked, and audited in its mutation transaction.
      </p>
      <RecordPanel className="mt-8 grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <Metric label="Granted resources" value={resources.length} />
        <p className="max-w-2xl border-t border-border pt-5 text-base leading-7 text-muted-ink sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          The index below is derived from active application capabilities for this current MFA session.
        </p>
      </RecordPanel>
      {resources.length === 0 ? (
        <EmptyState className="mt-6" description="No administration resource is exposed without a matching active capability." eyebrow="Capability index" icon={PanelsTopLeft} title="No operational resources are available." />
      ) : (
        <ul className="mt-6 grid gap-4 p-0 sm:grid-cols-2">
          {resources.map((resource) => (
            <li key={resource.slug}>
              <RecordPanel interactive className="flex h-full flex-col p-5 sm:p-6">
                <DataLabel>{resource.capability}</DataLabel>
                <h2 className="mt-3 font-heading text-2xl">{resource.label}</h2>
                <p className="mt-3 text-base leading-6 text-muted-ink">{resource.description}</p>
                <Link href={`/admin/${resource.slug}`} className="record-link mt-auto inline-flex min-h-11 items-center gap-2 pt-5">
                  Open resource
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </Link>
              </RecordPanel>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
