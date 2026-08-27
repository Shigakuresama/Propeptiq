# Incidents and Recovery

## Severity and immediate containment

Treat unauthorized access, secret exposure, payment/refund/inventory duplication, human-use or unsupported public claims, test data in production, destination fail-open, and unauthorized shipment as high-priority incidents.

1. Stop the narrow affected path: unpublish a record, disable provider checkout, block a staff session, pause refunds, or pause fulfillment.
2. Preserve correlation IDs, commit/deployment/migration IDs, redacted logs, provider event IDs/hashes, and immutable journals.
3. Rotate exposed credentials and revoke affected sessions; do not print or copy secrets into the incident record.
4. Identify scope using authoritative records, not browser displays alone.

## Scenario actions

- **Human-use/unsupported claim:** unpublish affected projection, preserve exact version, check related promotions/cross-sells, and route factual/legal review to accountable owners.
- **Catalog/test-data leak:** unpublish, confirm production fixture guard, trace import source, and verify affected orders.
- **Destination fail-open:** disable affected product/rule or checkout, identify exact product/state and orders, keep fulfillment held, and obtain counsel-owned correction.
- **Provider/webhook incident:** reject invalid signatures, deduplicate same-ID/same-hash events, quarantine same-ID/different-hash conflicts, and reconcile payment/inventory/refund effects.
- **Inventory/refund/shipment duplication:** stop the affected consumer, use unique records to identify effects, append corrective events, and verify balances.
- **Identity/staff takeover:** revoke sessions/roles, rotate affected secrets, review audit events, and re-establish current MFA before restoring capability.

## Recovery

Restore or branch from a known point only when necessary. Reconcile external provider events into immutable journals idempotently. Validate identity authorization, destination resolution, authoritative totals, payment, inventory, refunds, review snapshots, and fulfillment consume-once invariants before resuming the affected path.

## External decisions

Qualified counsel owns legal/SKU/destination conclusions; catalog owners own real product facts; operations owns tax, shipping, and fulfillment; the provider owns acceptance. An incident process may preserve and route these facts but cannot manufacture approval.

## Closure

Record timeline, root cause, affected records/customers, containment, exact corrective events, read-back/verification results, customer or regulator communication owner, residual risk, and follow-up tests. Re-enable only the capability proven safe; do not treat a broad deployment as proof that every integration recovered.
