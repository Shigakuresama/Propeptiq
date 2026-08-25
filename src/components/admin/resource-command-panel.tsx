import type { ReactNode } from "react";

import {
  activateProductAction,
  activatePromotionAction,
  changeBuyerStatusAction,
  changeStaffCapabilityAction,
  decideReviewAction,
  publishAttestationAction,
  publishCoaAction,
  requestRefundAction,
  retireProductAction,
  retirePromotionAction,
  saveAnalyticalClaimDraftAction,
  saveCoaDraftAction,
  saveLotDraftAction,
  savePolicyGroupAction,
  saveProductDraftAction,
  savePromotionDraftAction,
  saveShipmentAction,
  setAnalyticalClaimLifecycleAction,
  setCoaLifecycleAction,
  setLotLifecycleAction,
  setPolicyGroupLifecycleAction,
  supersedeDestinationAction,
  supersedeProductPriceAction,
} from "@/admin/actions";
import type { AdminResource } from "@/admin/access";
import type { AdminReadSnapshot, SafePromotionConfiguration } from "@/admin/admin-read";
import { Button } from "@/components/ui/button";
import { CAPABILITIES } from "@/domain/authorization";

type Option = Readonly<{ value: string; label: string }>;

function versionedValue(id: string, expectedUpdatedAt: string): string {
  return JSON.stringify({ id, expectedUpdatedAt });
}

function datetimeInput(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : "";
}

function Field({
  label,
  name,
  defaultValue = "",
  required = true,
  type = "text",
  maxLength,
  min,
  max,
  readOnly = false,
  list,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null | undefined;
  required?: boolean;
  type?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  readOnly?: boolean;
  list?: string;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <input
        className="form-input"
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        type={type}
        maxLength={maxLength}
        min={min}
        max={max}
        readOnly={readOnly}
        list={list}
      />
    </label>
  );
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

function TextArea({
  label,
  name,
  defaultValue = "",
  maxLength,
  required = true,
}: {
  label: string;
  name: string;
  defaultValue?: string | undefined;
  maxLength: number;
  required?: boolean;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <textarea
        name={name}
        className="form-input min-h-32"
        required={required}
        maxLength={maxLength}
        defaultValue={defaultValue}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly Option[];
  defaultValue?: string;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <select className="form-input" name={name} defaultValue={defaultValue} required>
        {options.map((option) => (
          <option value={option.value} key={`${option.value}:${option.label}`}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CommandForm({
  action,
  title,
  children,
}: {
  action: (formData: FormData) => Promise<never>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="record-card">
      <h2 className="font-heading text-2xl">{title}</h2>
      <form action={action} aria-label={title} className="mt-6 grid gap-5">
        {children}
        <Button type="submit" className="action-primary w-full sm:w-auto">
          Submit guarded command
        </Button>
      </form>
    </section>
  );
}

function ReadOnlyBoundary({ children }: { children: ReactNode }) {
  return (
    <section className="record-card">
      <h2 className="font-heading text-2xl">Read-only lifecycle boundary</h2>
      <p className="mt-4 text-base leading-7 text-muted-ink">{children}</p>
    </section>
  );
}

function EmptyCommand({ children }: { children: ReactNode }) {
  return <p className="info-record">{children}</p>;
}

function IdDatalist({ id, values }: { id: string; values: readonly string[] }) {
  return (
    <datalist id={id}>
      {[...new Set(values)].map((value) => <option key={value} value={value} />)}
    </datalist>
  );
}

function promotionConfigFields(configuration?: SafePromotionConfiguration) {
  const productIds =
    configuration?.kind === "bundle" || configuration?.kind === "cross_sell"
      ? configuration.productIds.join(", ")
      : "";
  const interval = configuration?.kind === "subscription" ? configuration.interval : "month";
  const intervalCount = configuration?.kind === "subscription" ? configuration.intervalCount : "";
  const pointsPerDollar = configuration?.kind === "loyalty" ? configuration.pointsPerDollar : "";
  return (
    <>
      <Field label="Bundle or cross-sell product IDs, comma separated" name="configurationProductIds" defaultValue={productIds} required={false} maxLength={1900} />
      <label><span className="form-label">Subscription interval</span><select name="interval" className="form-input" defaultValue={interval}><option value="month">Month</option><option value="year">Year</option></select></label>
      <Field label="Subscription interval count" name="intervalCount" defaultValue={intervalCount} required={false} type="number" min={1} max={12} />
      <Field label="Loyalty points per dollar" name="pointsPerDollar" defaultValue={pointsPerDollar} required={false} type="number" min={1} max={100} />
    </>
  );
}

export function ResourceCommandPanel({
  resource,
  snapshot,
}: {
  resource: AdminResource;
  snapshot: AdminReadSnapshot;
}) {
  if (resource.slug !== snapshot.resource) {
    return <EmptyCommand>The authoritative resource read-back did not match this route. Commands fail closed.</EmptyCommand>;
  }

  switch (snapshot.resource) {
    case "products": {
      const draftOptions = snapshot.items.filter((item) => item.status === "draft").map((item) => ({
        value: versionedValue(item.id, item.updatedAt),
        label: `${item.name} · ${item.id}`,
      }));
      const retireOptions = snapshot.items.filter((item) => item.status !== "retired").map((item) => ({
        value: versionedValue(item.id, item.updatedAt),
        label: `${item.name} · ${item.status}`,
      }));
      const policyGroupIds = snapshot.items.map((item) => item.policyGroupId);
      return (
        <div className="grid gap-6">
          <CommandForm action={saveProductDraftAction} title="Create a product draft">
            <Field label="Slug" name="slug" maxLength={160} />
            <Field label="Public product name" name="name" maxLength={240} />
            <Field label="Package form" name="packageForm" maxLength={240} />
            <Field label="Material identity" name="materialIdentity" maxLength={500} />
            <Field label="Policy group ID" name="policyGroupId" list="known-product-policy-groups" />
            <IdDatalist id="known-product-policy-groups" values={policyGroupIds} />
          </CommandForm>
          {snapshot.items.filter((item) => item.status === "draft").map((item) => (
            <CommandForm key={`edit:${item.id}`} action={saveProductDraftAction} title={`Update draft · ${item.name}`}>
              <Hidden name="productId" value={item.id} />
              <Hidden name="expectedUpdatedAt" value={item.updatedAt} />
              <Field label="Slug" name="slug" defaultValue={item.slug} maxLength={160} />
              <Field label="Public product name" name="name" defaultValue={item.name} maxLength={240} />
              <Field label="Package form" name="packageForm" defaultValue={item.packageForm} maxLength={240} />
              <Field label="Material identity" name="materialIdentity" defaultValue={item.materialIdentity} maxLength={500} />
              <Field label="Policy group ID" name="policyGroupId" defaultValue={item.policyGroupId} list="known-product-policy-groups" />
            </CommandForm>
          ))}
          {draftOptions.length ? (
            <CommandForm action={activateProductAction} title="Activate one verified product">
              <SelectField label="Verified draft product" name="productReference" options={draftOptions} />
              <p className="info-record">The server rechecks USD price, active policy, released positive-stock lot, evidence, and safe copy in one transaction.</p>
            </CommandForm>
          ) : <EmptyCommand>No draft product is available for activation.</EmptyCommand>}
          {retireOptions.length ? (
            <CommandForm action={retireProductAction} title="Retire one product">
              <SelectField label="Current product" name="productReference" options={retireOptions} />
            </CommandForm>
          ) : null}
        </div>
      );
    }
    case "prices": {
      const productIds = snapshot.items.map((item) => item.productId);
      return (
        <CommandForm action={supersedeProductPriceAction} title="Supersede the current USD price">
          <Field label="Product ID" name="productId" list="known-price-products" />
          <IdDatalist id="known-price-products" values={productIds} />
          <Field label="New USD amount in cents" name="amountMinor" type="number" min={1} max={100000000} />
          <p className="info-record">Task 5 is US-first: only USD is accepted. Prior prices remain immutable and are atomically superseded.</p>
        </CommandForm>
      );
    }
    case "policy-groups": {
      const options = snapshot.items.map((item) => ({ value: versionedValue(item.id, item.updatedAt), label: `${item.name} · ${item.active ? "active" : "inactive"}` }));
      return (
        <div className="grid gap-6">
          <CommandForm action={savePolicyGroupAction} title="Create a policy group draft">
            <Field label="Slug" name="slug" maxLength={160} />
            <Field label="Policy group name" name="name" maxLength={240} />
          </CommandForm>
          {snapshot.items.filter((item) => !item.active).map((item) => (
            <CommandForm key={`edit:${item.id}`} action={savePolicyGroupAction} title={`Update inactive group · ${item.name}`}>
              <Hidden name="policyGroupId" value={item.id} /><Hidden name="expectedUpdatedAt" value={item.updatedAt} />
              <Field label="Slug" name="slug" defaultValue={item.slug} maxLength={160} />
              <Field label="Policy group name" name="name" defaultValue={item.name} maxLength={240} />
            </CommandForm>
          ))}
          {options.length ? (
            <CommandForm action={setPolicyGroupLifecycleAction} title="Change one policy group lifecycle">
              <SelectField label="Policy group" name="policyGroupReference" options={options} />
              <label><span className="form-label">Lifecycle</span><select name="active" className="form-input"><option value="true">Activate</option><option value="false">Deactivate</option></select></label>
            </CommandForm>
          ) : null}
        </div>
      );
    }
    case "lots": {
      const lotOptions = snapshot.items.map((item) => ({ value: versionedValue(item.id, item.updatedAt), label: `${item.productName} · ${item.supplierLotCode} · ${item.status}` }));
      const productIds = snapshot.items.map((item) => item.productId);
      const draftFields = (defaults?: (typeof snapshot.items)[number]) => (
        <>
          <Field label="Product ID" name="productId" defaultValue={defaults?.productId} list="known-lot-products" />
          <Field label="Supplier name" name="supplierName" defaultValue={defaults?.supplierName} maxLength={240} />
          <Field label="Supplier lot code" name="supplierLotCode" defaultValue={defaults?.supplierLotCode} maxLength={160} />
          <Field label="Analytical method" name="analyticalMethod" defaultValue={defaults?.analyticalMethod} required={false} maxLength={240} />
          <Field label="Received quantity" name="receivedQuantity" defaultValue={defaults?.receivedQuantity} type="number" min={1} max={100000000} />
          <Field label="Available quantity" name="availableQuantity" defaultValue={defaults?.availableQuantity} type="number" min={0} max={100000000} />
          <Field label="Manufactured at (UTC)" name="manufacturedAt" defaultValue={datetimeInput(defaults?.manufacturedAt)} required={false} type="datetime-local" />
          <Field label="Expires at (UTC)" name="expiresAt" defaultValue={datetimeInput(defaults?.expiresAt)} required={false} type="datetime-local" />
        </>
      );
      return (
        <div className="grid gap-6">
          <IdDatalist id="known-lot-products" values={productIds} />
          <CommandForm action={saveLotDraftAction} title="Create a lot draft">{draftFields()}</CommandForm>
          {snapshot.items.filter((item) => item.status === "draft").map((item) => (
            <CommandForm key={`edit:${item.id}`} action={saveLotDraftAction} title={`Update lot draft · ${item.supplierLotCode}`}>
              <Hidden name="lotId" value={item.id} /><Hidden name="expectedUpdatedAt" value={item.updatedAt} />
              {draftFields(item)}
            </CommandForm>
          ))}
          {lotOptions.length ? (
            <CommandForm action={setLotLifecycleAction} title="Change one lot lifecycle">
              <SelectField label="Lot" name="lotReference" options={lotOptions} />
              <label><span className="form-label">Lifecycle</span><select name="status" className="form-input"><option value="released">Release</option><option value="quarantined">Quarantine</option><option value="exhausted">Mark exhausted</option><option value="recalled">Recall</option></select></label>
              <p className="info-record">Release rechecks bounded public lot copy, product binding, quantities, and valid lifecycle transitions.</p>
            </CommandForm>
          ) : null}
        </div>
      );
    }
    case "coas": {
      const draftItems = snapshot.items.filter((item) => !item.active && !item.public);
      const lifecycleItems = snapshot.items.filter((item) => item.active || !item.public);
      const publishOptions = snapshot.items.filter((item) => item.active && !item.public).map((item) => ({ value: item.id, label: `${item.supplierLotCode} · ${item.id}` }));
      return (
        <div className="grid gap-6">
          <CommandForm action={saveCoaDraftAction} title="Create a private COA manifest draft">
            <Field label="Lot ID" name="lotId" />
            <Field label="Private storage key" name="storageKey" maxLength={500} />
            <Field label="Expected lowercase SHA-256" name="evidenceHash" maxLength={64} />
            <Field label="COA issued at (UTC)" name="issuedAt" required={false} type="datetime-local" />
          </CommandForm>
          {draftItems.map((item) => (
            <CommandForm key={`edit:${item.id}`} action={saveCoaDraftAction} title={`Update private COA manifest · ${item.supplierLotCode}`}>
              <Hidden name="coaDocumentId" value={item.id} />
              <Hidden name="lotId" value={item.lotId} />
              <Hidden name="expectedEvidenceHash" value={item.evidenceHash} />
              <Field label="Current private storage key (CAS)" name="expectedStorageKey" maxLength={500} />
              <Field label="New private storage key" name="storageKey" maxLength={500} />
              <Field label="New expected lowercase SHA-256" name="evidenceHash" defaultValue={item.evidenceHash} maxLength={64} />
              <Field label="COA issued at (UTC)" name="issuedAt" defaultValue={datetimeInput(item.issuedAt)} required={false} type="datetime-local" />
              <p className="info-record">Private object keys are deliberately not exposed in the read model. The current key must be confirmed for this exact-manifest update.</p>
            </CommandForm>
          ))}
          {lifecycleItems.length ? (
            <CommandForm action={setCoaLifecycleAction} title="Change one private COA lifecycle">
              <SelectField label="Private COA" name="coaDocumentId" options={lifecycleItems.map((item) => ({ value: item.id, label: `${item.supplierLotCode} · ${item.active ? "active" : "inactive"}` }))} />
              <Field label="Current private storage key (CAS)" name="expectedStorageKey" maxLength={500} />
              <Field label="Current evidence SHA-256 (CAS)" name="expectedEvidenceHash" maxLength={64} />
              <label><span className="form-label">Lifecycle</span><select name="active" className="form-input"><option value="true">Activate privately</option><option value="false">Deactivate privately</option></select></label>
            </CommandForm>
          ) : null}
          {publishOptions.length ? (
            <CommandForm action={publishCoaAction} title="Verify and publish one COA manifest">
              <SelectField label="Active private COA document" name="coaDocumentId" options={publishOptions} />
              <p className="info-record">The trusted server storage adapter verifies existence and streams a SHA-256 digest before the short exact-manifest mutation transaction.</p>
            </CommandForm>
          ) : <EmptyCommand>No COA manifest is available for verification.</EmptyCommand>}
        </div>
      );
    }
    case "analytical-claims": {
      const options = snapshot.items.map((item) => ({ value: versionedValue(item.id, item.updatedAt), label: `${item.productName} · ${item.active ? "active" : "draft"}` }));
      const draftFields = (item?: (typeof snapshot.items)[number]) => (
        <>
          <Field label="Product ID" name="productId" defaultValue={item?.productId} />
          <Field label="Lot ID" name="lotId" defaultValue={item?.lotId} />
          <Field label="COA document ID" name="coaDocumentId" defaultValue={item?.coaDocumentId} />
          <TextArea label="Analytical claim text" name="text" defaultValue={item?.text} maxLength={1000} />
        </>
      );
      return (
        <div className="grid gap-6">
          <CommandForm action={saveAnalyticalClaimDraftAction} title="Create an analytical claim draft">{draftFields()}</CommandForm>
          {snapshot.items.filter((item) => !item.active).map((item) => (
            <CommandForm key={`edit:${item.id}`} action={saveAnalyticalClaimDraftAction} title={`Update claim draft · ${item.productName}`}>
              <Hidden name="claimId" value={item.id} /><Hidden name="expectedUpdatedAt" value={item.updatedAt} />
              {draftFields(item)}
            </CommandForm>
          ))}
          {options.length ? (
            <CommandForm action={setAnalyticalClaimLifecycleAction} title="Change one analytical claim lifecycle">
              <SelectField label="Analytical claim" name="claimReference" options={options} />
              <label><span className="form-label">Lifecycle</span><select name="active" className="form-input"><option value="true">Activate after evidence checks</option><option value="false">Retire</option></select></label>
            </CommandForm>
          ) : null}
        </div>
      );
    }
    case "attestations":
      return (
        <CommandForm action={publishAttestationAction} title="Publish a new attestation version">
          <TextArea label="Policy text" name="policyText" maxLength={12000} />
          <Field label="Optional expected lowercase SHA-256" name="suppliedContentHash" required={false} maxLength={64} />
          <p className="info-record">The version and immediate effective time are derived by the server inside the supersession transaction.</p>
        </CommandForm>
      );
    case "destination-rules":
      return (
        <CommandForm action={supersedeDestinationAction} title="Atomically supersede a destination rule">
          <label><span className="form-label">Scope</span><select name="scopeKind" className="form-input"><option value="product">Product</option><option value="policy_group">Policy group</option></select></label>
          <Field label="Product or policy group ID" name="targetId" list="known-destination-targets" />
          <IdDatalist id="known-destination-targets" values={snapshot.items.flatMap((item) => [item.productId, item.policyGroupId].filter((value): value is string => value !== null))} />
          <Field label="US state code" name="stateCode" defaultValue="CA" maxLength={2} />
          <label><span className="form-label">Result</span><select name="result" className="form-input"><option value="allowed">Allowed</option><option value="review">Manual review</option><option value="blocked">Blocked</option></select></label>
          <p className="info-record">Activation time and monotonic version are server-owned; the prior current rule is superseded atomically.</p>
        </CommandForm>
      );
    case "promotions": {
      const promotionOptions = snapshot.items.map((item) => ({ value: versionedValue(item.id, item.updatedAt), label: `${item.code} · ${item.status}` }));
      const promotionFields = (item?: (typeof snapshot.items)[number]) => (
        <>
          <Field label="Promotion code" name="code" defaultValue={item?.code} maxLength={80} />
          <Field label="Public promotion name" name="name" defaultValue={item?.name} maxLength={240} />
          <label><span className="form-label">Kind</span><select name="kind" className="form-input" defaultValue={item?.kind ?? "discount"}><option value="discount">Discount</option><option value="bundle">Bundle</option><option value="subscription">Subscription</option><option value="loyalty">Loyalty</option><option value="cross_sell">Cross-sell</option></select></label>
          <Field label="Fixed amount in minor units" name="amountMinor" defaultValue={item?.amountMinor} required={false} type="number" min={1} max={100000000} />
          <Field label="Discount basis points" name="basisPoints" defaultValue={item?.basisPoints} required={false} type="number" min={1} max={10000} />
          <Field label="Currency (USD only when a fixed amount is set)" name="currency" defaultValue={item?.currency ?? ""} required={false} maxLength={3} />
          {promotionConfigFields(item?.configuration)}
          <Field label="Target product IDs, comma separated" name="targetProductIds" defaultValue={item?.targets.filter((target) => target.kind === "product").map((target) => target.id).join(", ")} required={false} maxLength={1900} />
          <Field label="Target policy group IDs, comma separated" name="targetPolicyGroupIds" defaultValue={item?.targets.filter((target) => target.kind === "policy_group").map((target) => target.id).join(", ")} required={false} maxLength={1900} />
          <Field label="Starts at (UTC)" name="startsAt" defaultValue={datetimeInput(item?.startsAt)} required={false} type="datetime-local" />
          <Field label="Ends at (UTC)" name="endsAt" defaultValue={datetimeInput(item?.endsAt)} required={false} type="datetime-local" />
        </>
      );
      return (
        <div className="grid gap-6">
          <CommandForm action={savePromotionDraftAction} title="Create a promotion draft">{promotionFields()}</CommandForm>
          {snapshot.items.filter((item) => item.status === "draft").map((item) => (
            <CommandForm key={`edit:${item.id}`} action={savePromotionDraftAction} title={`Update promotion draft · ${item.code}`}>
              <Hidden name="promotionId" value={item.id} /><Hidden name="expectedUpdatedAt" value={item.updatedAt} />
              {promotionFields(item)}
            </CommandForm>
          ))}
          {promotionOptions.filter((option) => snapshot.items.find((item) => versionedValue(item.id, item.updatedAt) === option.value)?.status === "draft").length ? (
            <CommandForm action={activatePromotionAction} title="Activate one canonical promotion">
              <SelectField label="Draft promotion" name="promotionReference" options={snapshot.items.filter((item) => item.status === "draft").map((item) => ({ value: versionedValue(item.id, item.updatedAt), label: `${item.code} · draft` }))} />
              <p className="info-record">Activation revalidates the kind-specific configuration, schedule, at least one target, and every referenced product.</p>
            </CommandForm>
          ) : null}
          {snapshot.items.some((item) => item.status !== "retired") ? (
            <CommandForm action={retirePromotionAction} title="Retire one promotion">
              <SelectField label="Non-retired promotion" name="promotionReference" options={snapshot.items.filter((item) => item.status !== "retired").map((item) => ({ value: versionedValue(item.id, item.updatedAt), label: `${item.code} · ${item.status}` }))} />
            </CommandForm>
          ) : null}
        </div>
      );
    }
    case "buyers": {
      const options = snapshot.items.map((item) => ({ value: versionedValue(item.userId, item.updatedAt), label: `${item.userId} · ${item.status}` }));
      return options.length ? (
        <CommandForm action={changeBuyerStatusAction} title="Change one buyer status">
          <SelectField label="Buyer" name="buyerReference" options={options} />
          <label><span className="form-label">Status</span><select name="status" className="form-input"><option value="review">Review</option><option value="blocked">Blocked</option><option value="active">Active after current identity re-verification</option></select></label>
          <p className="info-record">Reactivation loads the target Clerk identity outside database locks, then revalidates the same buyer version and current attestation in a short transaction.</p>
        </CommandForm>
      ) : <EmptyCommand>No buyer profile is available for a status command.</EmptyCommand>;
    }
    case "review-requests": {
      const pending = snapshot.items.filter((item) => item.outcome === null).map((item) => ({ value: item.id, label: `${item.id} · order ${item.orderId}` }));
      return pending.length ? (
        <CommandForm action={decideReviewAction} title="Decide one pending review">
          <SelectField label="Pending review" name="reviewRequestId" options={pending} />
          <label><span className="form-label">Outcome</span><select name="outcome" className="form-input"><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
          <p className="info-record">Buyer-review coverage is derived from the immutable request snapshot, never this form.</p>
        </CommandForm>
      ) : <EmptyCommand>No pending review request is available.</EmptyCommand>;
    }
    case "orders":
      return <ReadOnlyBoundary>Order creation, payment authorship, inventory effects, and provider execution remain unavailable until Task 6. This page exposes only the capability-scoped authoritative read model.</ReadOnlyBoundary>;
    case "refunds": {
      const orderIds = [...new Set(snapshot.items.map((item) => item.orderId))];
      return (
        <CommandForm action={requestRefundAction} title="Record a requested refund intent">
          <Field label="Order ID" name="orderId" list="known-refund-orders" />
          <IdDatalist id="known-refund-orders" values={orderIds} />
          <Field label="Amount in minor units" name="requestedAmountMinor" defaultValue="100" type="number" min={1} max={100000000} />
          <Field label="Unique idempotency key" name="idempotencyKey" maxLength={120} />
          <Field label="Redacted operator reason (optional)" name="reasonRedacted" required={false} maxLength={500} />
          <p className="warning-record">This records a bounded requested intent only. Provider submission and confirmation remain unavailable.</p>
        </CommandForm>
      );
    }
    case "shipments": {
      return (
        <div className="grid gap-6">
          <CommandForm action={saveShipmentAction} title="Create pending shipment metadata">
            <Field label="Order ID with a current issued release" name="orderId" list="known-shipment-orders" />
            <IdDatalist id="known-shipment-orders" values={snapshot.items.map((item) => item.orderId)} />
            <Field label="Carrier" name="carrier" maxLength={100} />
            <Field label="Tracking reference" name="trackingReference" maxLength={200} />
            <Hidden name="expectedUpdatedAt" value="" />
            <p className="warning-record">Handoff, delivery, release issuance, and inventory effects remain unavailable.</p>
          </CommandForm>
          {snapshot.items.map((item) => (
            <CommandForm key={item.id} action={saveShipmentAction} title={`Update pending shipment · ${item.orderId}`}>
              <Hidden name="orderId" value={item.orderId} /><Hidden name="expectedUpdatedAt" value={item.updatedAt} />
              <Field label="Carrier" name="carrier" defaultValue={item.carrier} maxLength={100} />
              <Field label="Tracking reference" name="trackingReference" defaultValue={item.trackingReference} maxLength={200} />
            </CommandForm>
          ))}
        </div>
      );
    }
    case "staff": {
      const staffIds = [...new Set(snapshot.items.map((item) => item.userId))];
      return (
        <CommandForm action={changeStaffCapabilityAction} title="Grant or revoke one known capability">
          <Field label="Target user ID" name="userId" list="known-staff-users" />
          <IdDatalist id="known-staff-users" values={staffIds} />
          <label><span className="form-label">Capability</span><select name="capability" className="form-input">{CAPABILITIES.map((capability) => <option value={capability} key={capability}>{capability}</option>)}</select></label>
          <label><span className="form-label">Change</span><select name="enabled" className="form-input"><option value="true">Grant</option><option value="false">Revoke</option></select></label>
          <p className="info-record">The database rechecks active staff:manage in the same transaction. Self-grant and first-admin bootstrap are denied.</p>
        </CommandForm>
      );
    }
    case "audit":
      return <ReadOnlyBoundary>Audit records are append-only, redacted, correlation-bound, and written atomically with each successful mutation. No edit or delete command is exposed.</ReadOnlyBoundary>;
  }
}
