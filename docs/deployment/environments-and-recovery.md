# Environments, Deployment, and Recovery

## Environment separation

| Environment | Data and providers | Allowed use |
|---|---|---|
| Local/test | isolated database and clearly labeled test fixtures; provider fakes/test modes | automated and manual development only |
| Preview | isolated Clerk/Neon/Blob/email/Stripe test resources and synthetic identities/catalog | controlled review; no live payment, customer message, or shipment |
| Production | separately scoped production resources and real imported records | enabled only where verified external inputs and application controls pass |

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

Use reviewed commits, protected production deployment, environment-specific secrets, guarded ordered migrations, and a pre-deploy backup/restore plan. Run the documented release commands against the exact commit. Never infer a passed integration, external decision, or live behavior from local lint/tests.

## Safe modes

- Provider mode defaults disabled; test uses test resources; live requires verified provider acceptance/configuration.
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
