import { notFound } from "next/navigation";

import { adminGate, resourceBySlug } from "@/admin/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { AdminGateState } from "@/components/admin/admin-gate-state";
import { AdminResourceRecords } from "@/components/admin/admin-resource-records";
import { CommandResultNotice } from "@/components/admin/command-result-notice";
import { ResourceCommandPanel, type CommerceCommandOutcome } from "@/components/admin/resource-command-panel";
import { isCanonicalUuid } from "@/commerce/checkout-identity";

const resultCopy = {
  saved: "The submitted command returned without a domain error. This editable URL status is not authoritative; confirm the resource or audit read-back.",
  stale: "The record changed before this command committed. Refresh the authoritative version.",
  "rate-limited": "The database-backed mutation limit was reached. Wait for the fixed window to reset.",
  denied: "The command was denied by identity, MFA, capability, or domain policy.",
  unavailable: "A required current record, verified dependency, or lifecycle fact is unavailable.",
} as const;

const commerceCommandResources = {
  "submit-refund": "refunds",
  "clear-hold": "orders",
  handoff: "shipments",
  deliver: "shipments",
  exception: "shipments",
} as const;

const commerceResults = new Set([
  "submitted", "awaiting_signed_event", "succeeded", "cleared", "already_clear",
  "handed_off", "already_handed_off", "delivered", "already_delivered",
  "exception", "already_exception", "ineligible", "conflict", "held", "denied",
  "stale", "rate-limited", "unavailable", "failed", "cancelled",
]);

export default async function AdminResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ result?: string; command?: string; target?: string }>;
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
  const command = query.command && Object.hasOwn(commerceCommandResources, query.command)
    ? query.command as keyof typeof commerceCommandResources
    : null;
  const outcome: CommerceCommandOutcome | undefined =
    command !== null && commerceCommandResources[command] === slug &&
    query.target !== undefined && isCanonicalUuid(query.target) &&
    query.result !== undefined && commerceResults.has(query.result)
      ? { command, target: query.target, result: query.result }
      : undefined;
  const result =
    outcome === undefined && query.result && Object.hasOwn(resultCopy, query.result)
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
        <CommandResultNotice
          error={query.result !== "saved"}
          heading={query.result === "saved" ? "Command response received" : "Command not completed"}
          message={result}
          className="mt-7"
        />
      ) : null}
      <div className="mt-8">
        <ResourceCommandPanel
          resource={resource}
          snapshot={snapshot}
          {...(outcome === undefined ? {} : { outcome })}
        />
      </div>
      <AdminResourceRecords snapshot={snapshot} />
    </section>
  );
}
