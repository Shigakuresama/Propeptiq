# Environments, Deployment, and Recovery

## Target environment separation

This table is the required target topology, not a statement that Preview or
Production accounts, resources, secrets, or deployments currently exist.

| Environment | Target data and providers | Current allowed use |
|---|---|---|
| Local/test | isolated database and clearly labeled test fixtures; provider fakes/test modes | automated and manual development only |
| Preview | separately provisioned test-only identity/database/provider resources and pre-created synthetic identities; synthetic demo catalog only | **not published or provisioned**; browse-only preparation, with buyer checkout unavailable |
| Production | separately scoped production resources and real imported records | buyer checkout is inert at this checkpoint, regardless of environment flags; later activation requires separate authorization and every external/application prerequisite |

Never share production credentials or customer data with Local/Preview. Production demo/test catalog mode must hard-fail.

## External activation inputs

Production commerce remains unavailable until accountable owners provide and verify:

- qualified legal review and a counsel-approved real SKU/state allowlist;
- real manifest data for products, prices, packages, suppliers, lots, inventory, and any COAs;
- tax configuration and shipping-service availability;
- an operating fulfillment process; and
- payment-provider acceptance and production enablement.

These are deployment inputs and owner evidence, not database approval workflows. Missing catalog/destination inputs keep affected products unavailable; missing tax/shipping/provider inputs deny checkout; missing fulfillment readiness prevents release.

## Promotion and migration

Use reviewed commits, protected production deployment, environment-specific secrets, guarded ordered migrations, and a pre-deploy backup/restore plan. This repository currently exposes `db:generate` and `db:check` for source consistency only; it does **not** provide or authorize a Preview or Production migration-apply command. A future migration apply requires a separately reviewed command, exact target proof, backup/recovery evidence, and post-apply reconciliation. Never infer a passed integration, applied migration, external decision, or live behavior from local lint/tests.

## Safe modes

- Provider mode defaults disabled. Preview preparation remains browse-only even with syntactically valid test placeholders, and Production buyer checkout remains unavailable at this checkpoint. External acceptance/configuration is necessary but not sufficient for any later activation.
- Catalog projection defaults empty when real records are absent.
- Destination defaults unavailable when no active rule resolves.
- Tax/shipping absence denies hosted checkout.
- Fulfillment release remains disabled when the operating process or application prerequisites are unavailable.

## Recovery

1. Stop the narrow affected mutation path (checkout, webhook side effects, refunds, publication, or fulfillment).
2. Preserve correlation IDs, redacted logs, provider event IDs/hashes, deployment/commit/migration IDs, and relevant immutable journals.
3. Rotate exposed credentials and revoke affected staff sessions when applicable.
4. Restore or branch the database from an identified point, then reconcile provider/payment/inventory/refund/shipment events idempotently.
5. Validate integrity and replay safety in isolation before resuming.
6. Resume only the affected capability after owner approval and record the incident/recovery evidence.

Do not delete journals or fabricate records to force systems to agree. Restore tests must verify order/payment/inventory/refund/review/shipment invariants and access denial.

## Rollback

Application rollback does not automatically reverse a database migration or provider effect. Prefer forward fixes; use a reviewed data migration when needed. A rollback must preserve compatibility with the deployed schema and journals, then rerun scoped verification and reconciliation before resuming writes.
