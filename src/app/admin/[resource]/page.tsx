import { notFound } from "next/navigation";

import { adminGate, resourceBySlug } from "@/admin/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { AdminGateState } from "@/components/admin/admin-gate-state";
import { AdminResourceRecords } from "@/components/admin/admin-resource-records";
import { ResourceCommandPanel } from "@/components/admin/resource-command-panel";

const resultCopy = {
  saved: "The submitted command returned without a domain error. This editable URL status is not authoritative; confirm the resource or audit read-back.",
  stale: "The record changed before this command committed. Refresh the authoritative version.",
  "rate-limited": "The database-backed mutation limit was reached. Wait for the fixed window to reset.",
  denied: "The command was denied by identity, MFA, capability, or domain policy.",
  unavailable: "A required current record, verified dependency, or lifecycle fact is unavailable.",
} as const;

export default async function AdminResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { resource: slug } = await params;
  const resource = resourceBySlug(slug);
  if (!resource) notFound();
  const request = await getRequestIdentity();
  const gate = adminGate(request, resource);
  if (!gate.allowed) return <AdminGateState gate={gate} inline />;
  const repositories = getRequestRepositories(request);
  if (!repositories) {
    return (
      <section className="error-record" role="alert">
        The administration database is unavailable, so this resource fails closed.
      </section>
    );
  }
  const snapshot = await repositories.readAdminSnapshot(resource.slug);
  const query = await searchParams;
  const result =
    query.result && Object.hasOwn(resultCopy, query.result)
      ? resultCopy[query.result as keyof typeof resultCopy]
      : null;
  return (
    <section>
      <p className="eyebrow">Capability · {resource.capability}</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">
        {resource.label}
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
        {resource.description}
      </p>
      {result ? (
        <div
          className={query.result === "saved" ? "warning-record mt-7" : "error-record mt-7"}
          role={query.result === "saved" ? "status" : "alert"}
        >
          {result}
        </div>
      ) : null}
      <div className="mt-8">
        <ResourceCommandPanel
          resource={resource}
          snapshot={snapshot}
        />
      </div>
      <AdminResourceRecords snapshot={snapshot} />
      {["orders", "refunds", "shipments"].includes(slug) ? (
        <div className="warning-record mt-8">
          <strong>Task 6 boundary:</strong> order creation, payment authorship,
          provider refund submission, release issuance, inventory consumption,
          handoff, and delivery effects are unavailable here.
        </div>
      ) : null}
    </section>
  );
}
