import type { ReactNode } from "react";

import type { AdminReadSnapshot, SafePromotionConfiguration } from "@/admin/admin-read";

type Fact = readonly [label: string, value: ReactNode];

function formatInstant(value: string | null): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(parsed) + " UTC"
    : "Unavailable";
}

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${amountMinor} ${currency} minor units`;
  }
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function promotionConfiguration(configuration: SafePromotionConfiguration): string {
  switch (configuration.kind) {
    case "discount":
      return "Discount configuration";
    case "bundle":
    case "cross_sell":
      return `${configuration.kind.replace("_", " ")} · ${configuration.productIds.length} referenced product(s)`;
    case "subscription":
      return `Every ${configuration.intervalCount} ${configuration.interval}${configuration.intervalCount === 1 ? "" : "s"}`;
    case "loyalty":
      return `${configuration.pointsPerDollar} point(s) per dollar`;
    case "invalid":
      return "Invalid draft configuration — activation is blocked";
  }
}

function RecordCard({
  title,
  status,
  facts,
}: {
  title: string;
  status?: string;
  facts: readonly Fact[];
}) {
  return (
    <li className="record-card min-w-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 break-words font-heading text-2xl">{title}</h2>
        {status ? <span className="status-pill capitalize">{status.replaceAll("_", " ")}</span> : null}
      </div>
      <dl className="mt-5 grid gap-3 text-base sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-ink">{label}</dt>
            <dd className="mt-1 min-w-0 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function EmptyRecords() {
  return (
    <li className="empty-record">
      No records are available for this capability-scoped view.
    </li>
  );
}

export function AdminResourceRecords({ snapshot }: { snapshot: AdminReadSnapshot }) {
  const listLabel = `${snapshot.resource.replaceAll("-", " ")} authoritative records`;
  const empty = snapshot.items.length === 0 ? <EmptyRecords /> : null;
  const truncation = snapshot.truncated ? (
    <p className="warning-record mt-5" role="status">
      Showing the first {snapshot.limit} records. Narrower filters are unavailable for the current view.
    </p>
  ) : null;

  let records: ReactNode;
  switch (snapshot.resource) {
    case "products":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={item.name} status={item.status} facts={[
          ["Product ID", item.id], ["Slug", item.slug], ["Package", item.packageForm],
          ["Material identity", item.materialIdentity], ["Policy group", `${item.policyGroupName} · ${item.policyGroupId}`],
          ["Current version", item.updatedAt],
        ]} />
      ));
      break;
    case "prices":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`${item.productName} · ${item.currency}`} status={item.supersededAt ? "superseded" : "current"} facts={[
          ["Price ID", item.id], ["Product ID", item.productId], ["Version", item.version],
          ["Amount", formatMoney(item.amountMinor, item.currency)], ["Effective", formatInstant(item.effectiveAt)],
          ["Superseded", formatInstant(item.supersededAt)],
        ]} />
      ));
      break;
    case "policy-groups":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={item.name} status={item.active ? "active" : "inactive"} facts={[
          ["Policy group ID", item.id], ["Slug", item.slug], ["Current version", item.updatedAt],
        ]} />
      ));
      break;
    case "lots":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`${item.productName} · ${item.supplierLotCode}`} status={item.status} facts={[
          ["Lot ID", item.id], ["Product ID", item.productId], ["Supplier", item.supplierName],
          ["Analytical method", item.analyticalMethod ?? "Not supplied"],
          ["Available / received", `${item.availableQuantity} / ${item.receivedQuantity}`],
          ["Expires", formatInstant(item.expiresAt)], ["Current version", item.updatedAt],
        ]} />
      ));
      break;
    case "coas":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`COA · ${item.supplierLotCode}`} status={item.active && item.public ? "public active" : item.active ? "private active" : "private inactive"} facts={[
          ["COA document ID", item.id], ["Lot ID", item.lotId], ["Product ID", item.productId],
          ["Evidence SHA-256", item.evidenceHash], ["Issued", formatInstant(item.issuedAt)],
          ["Safe row version", item.rowVersion],
        ]} />
      ));
      break;
    case "analytical-claims":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={item.productName} status={item.active ? "active" : "draft"} facts={[
          ["Claim ID", item.id], ["Claim", item.text], ["Lot", `${item.supplierLotCode} · ${item.lotId}`],
          ["COA document ID", item.coaDocumentId], ["Evidence SHA-256", item.evidenceHash],
          ["Current version", item.updatedAt],
        ]} />
      ));
      break;
    case "attestations":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`Attestation version ${item.version}`} status={item.supersededAt ? "superseded" : "current"} facts={[
          ["Attestation ID", item.id], ["Content SHA-256", item.contentHash], ["Policy text", item.policyText],
          ["Effective", formatInstant(item.effectiveAt)], ["Superseded", formatInstant(item.supersededAt)],
        ]} />
      ));
      break;
    case "destination-rules":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`${item.stateCode} · ${item.targetLabel}`} status={item.active ? item.result : "superseded"} facts={[
          ["Rule ID", item.id], ["Scope", item.scopeKind.replace("_", " ")], ["Target ID", item.productId ?? item.policyGroupId ?? "Unavailable"],
          ["Version", item.version], ["Effective", formatInstant(item.effectiveAt)], ["Superseded", formatInstant(item.supersededAt)],
        ]} />
      ));
      break;
    case "promotions":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`${item.code} · ${item.name}`} status={item.status} facts={[
          ["Promotion ID", item.id], ["Kind", item.kind.replace("_", " ")],
          ["Terms version", item.version],
          ["Value", item.amountMinor !== null && item.currency ? formatMoney(item.amountMinor, item.currency) : item.basisPoints !== null ? `${item.basisPoints} basis points` : "Draft value incomplete"],
          ["Configuration", promotionConfiguration(item.configuration)],
          ["Targets", item.targets.length ? item.targets.map((target) => `${target.kind.replace("_", " ")}: ${target.id}`).join("; ") : "No targets — activation blocked"],
          ["Schedule", `${formatInstant(item.startsAt)} → ${formatInstant(item.endsAt)}`],
          ["Current version", item.updatedAt],
        ]} />
      ));
      break;
    case "reward-adjustments":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.rewardAccountId} title="Reward account" facts={[
          ["Reward account ID", item.rewardAccountId],
          ["Available points", item.availablePoints.toLocaleString("en-US")],
          ["Pending points", item.pendingPoints.toLocaleString("en-US")],
          ["Recent administrator adjustments", item.recentAdjustments.length === 0
            ? "No administrator adjustments recorded"
            : (
              <ul className="grid gap-3 p-0">
                {item.recentAdjustments.map((adjustment) => (
                  <li className="min-w-0 border-t border-line pt-3 first:border-0 first:pt-0" key={adjustment.adjustmentId}>
                    <span className="block break-words">{adjustment.adjustmentId}</span>
                    <span className="mt-1 block">
                      {adjustment.delta > 0 ? "+" : ""}{adjustment.delta.toLocaleString("en-US")} points
                      {" · "}{formatInstant(adjustment.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )],
        ]} />
      ));
      break;
    case "referral-codes":
      records = snapshot.items.map((item) => (
        <RecordCard
          key={item.referralCodeId}
          title={`Referral code · ${item.code}`}
          status={item.status}
          facts={[
            ["Referral code ID", item.referralCodeId],
            ["Public code", item.code],
            ["Created", formatInstant(item.createdAt)],
            ["Revoked", formatInstant(item.revokedAt)],
          ]}
        />
      ));
      break;
    case "shared-sets":
      records = snapshot.items.map((item) => (
        <RecordCard
          key={item.sharedSetId}
          title={`${item.label} · ${item.publicCode}`}
          status={item.active ? "active" : "inactive"}
          facts={[
            ["Shared set ID", item.sharedSetId],
            ["Public code", item.publicCode],
            ["Public label", item.label],
            ["Items", item.itemCount],
            ["Created", formatInstant(item.createdAt)],
            ["Current version", formatInstant(item.updatedAt)],
            ["Deactivated", formatInstant(item.deactivatedAt)],
          ]}
        />
      ));
      break;
    case "buyers":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.userId} title={`Buyer · ${item.userId}`} status={item.status} facts={[
          ["Verified email timestamp", formatInstant(item.emailVerifiedAt)], ["Age confirmed", formatInstant(item.ageConfirmedAt)],
          ["Research purpose", item.researchPurpose?.replaceAll("_", " ") ?? "Incomplete"],
          ["Organization", item.organizationName ?? "Not supplied"], ["Current version", item.updatedAt],
        ]} />
      ));
      break;
    case "review-requests":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`Review · ${item.id}`} status={item.outcome ?? "pending"} facts={[
          ["Buyer user ID", item.userId], ["Order ID", item.orderId], ["Snapshot SHA-256", item.snapshotHash],
          ["Buyer status snapshot", item.buyerStatusSnapshot], ["Attestation version", item.attestationVersion],
          ["Destination", item.destinationStateCode], ["Buyer review required", yesNo(item.buyerReviewRequired)],
          ["Destination review required", yesNo(item.destinationReviewRequired)], ["Created", formatInstant(item.createdAt)],
        ]} />
      ));
      break;
    case "orders":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`Order · ${item.id}`} status={item.state} facts={[
          ["Buyer user ID", item.buyerUserId], ["Buyer status snapshot", item.buyerStatusSnapshot],
          ["Destination", item.destinationStateCode], ["Total", formatMoney(item.totalMinor, item.currency)],
          ["Items", item.itemCount], ["Verified payment events", item.verifiedPaymentEventCount],
          ["Payment", item.paymentState.replaceAll("_", " ")], ["Current hold", item.holdState],
          ["Refund", item.refundState],
          ["Release", item.currentReleaseState === null ? "None" : `${item.currentReleaseState} · version ${item.releaseVersion}`],
          ["Shipment", item.shipmentState?.replaceAll("_", " ") ?? "None"],
          ["Provider execution", "Matching verified signed provider evidence changes payment state. Staff commands cannot mark an order paid."],
        ]} />
      ));
      break;
    case "refunds":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`Refund intent · ${item.id}`} status={item.status} facts={[
          ["Order ID", item.orderId], ["Provider", item.provider], ["Requested amount", formatMoney(item.requestedAmountMinor, item.currency)],
          ["Confirmed", item.confirmedAmountMinor === null ? "Not confirmed" : formatMoney(item.confirmedAmountMinor, item.currency)],
          ["Reason", item.reasonRedacted ?? "Not supplied"], ["Requested at", formatInstant(item.requestedAt)],
          ["Provider execution", item.status === "succeeded" ? "Confirmed by signed provider event" : "Managed by the guarded refund command"],
        ]} />
      ));
      break;
    case "shipments":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={`Shipment · ${item.id}`} status={item.state} facts={[
          ["Order ID", item.orderId], ["Release", item.releaseState === null ? "Not issued — preparation only" : `${item.releaseState} · version ${item.releaseVersion}`],
          ["Release expires", formatInstant(item.releaseExpiresAt)], ["Carrier", item.carrier],
          ["Tracking reference", item.trackingReference], ["Current version", item.updatedAt],
          ["Handoff confirmation", item.handedOffAt === null ? "Not recorded" : formatInstant(item.handedOffAt)],
          ["Delivery", item.deliveredAt === null ? "Not recorded" : formatInstant(item.deliveredAt)],
        ]} />
      ));
      break;
    case "staff":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.roleId} title={`Staff · ${item.userId}`} status={item.active ? "active" : "revoked"} facts={[
          ["Capability", item.capability ?? "Unknown capability"], ["Recognized", yesNo(item.recognizedCapability)],
          ["Granted", formatInstant(item.grantedAt)], ["Revoked", formatInstant(item.revokedAt)],
        ]} />
      ));
      break;
    case "audit":
      records = snapshot.items.map((item) => (
        <RecordCard key={item.id} title={item.action} facts={[
          ["Resource", `${item.resourceType} · ${item.resourceId}`], ["Actor", item.actorUserId ?? item.actorKind],
          ["Correlation ID", item.correlationId], ["Occurred", formatInstant(item.occurredAt)],
        ]} />
      ));
      break;
  }

  return (
    <section className="mt-10" aria-labelledby="authoritative-records-heading">
      <p className="eyebrow">Authoritative read-back</p>
      <h2 id="authoritative-records-heading" className="mt-3 font-heading text-3xl">
        Current records
      </h2>
      <ul
        className="mt-6 grid gap-4 p-0 lg:grid-cols-2"
        aria-label={snapshot.resource === "audit" ? "Redacted audit history" : listLabel}
      >
        {empty ?? records}
      </ul>
      {truncation}
    </section>
  );
}
