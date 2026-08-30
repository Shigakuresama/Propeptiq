# Environments, Deployment, and Recovery

## Target environment separation

This table records both the required target topology and the current safe
publication boundary. A protected browse-only Preview and a browse-only
Production alias exist, but neither activates the application's identity,
database, payment, storage, email, tax, shipping, fulfillment, or payout
adapters. Application environment settings do not prove whether an external
provider resource has been provisioned independently; resource availability and
application activation are separate facts.

| Environment | Target data and providers | Current allowed use |
|---|---|---|
| Local/test | isolated database and clearly labeled test fixtures; provider fakes/test modes | automated and manual development only |
| Preview | protected Vercel deployment; authorized owner browse manifest plus clearly labeled synthetic demo records; identity/database/provider modes disabled | browse and synthetic acceptance only; buyer checkout and external effects unavailable; each feature branch must be verified separately |
| Production | separately scoped production resources, an explicitly authorized owner browse manifest, and real imported commerce records | buyer checkout is inert at this checkpoint, regardless of environment flags; later activation requires separate authorization and every external/application prerequisite |

Never share production credentials or customer data with Local/Preview. Production demo/test catalog mode must hard-fail.

## External activation inputs

Production commerce remains unavailable until accountable owners provide and verify:

- qualified legal review and a counsel-approved real SKU/state allowlist;
- real manifest data for products, prices, packages, suppliers, lots, inventory, and any COAs;
- tax configuration and shipping-service availability;
- an operating fulfillment process; and
- payment-provider acceptance and production enablement.

Growth activation additionally requires owner-approved unit economics, reviewed
customer rewards/referral and affiliate terms, active database policy versions,
a defined payout/tax onboarding process, and an accountable external payout
method. Code defaults and local fixtures are not active policy records and must
never be promoted into Production data.

These are deployment inputs and owner evidence, not database approval workflows. Missing catalog/destination inputs keep affected products unavailable; missing tax/shipping/provider inputs deny checkout; missing fulfillment readiness prevents release.

Managed Neon Auth production activation additionally requires all of the
following, with evidence retained for the exact deployment target:

- separate, independently generated, stable cookie-signing and application
  rate-limit secrets stored outside the repository;
- production-capable custom SMTP configured in Managed Neon Auth with a verified
  sender;
- provider-required email verification;
- reviewed exact Preview and Production trusted origins, with localhost disabled
  for Production; and
- a branch-isolated Preview lifecycle test covering signup, email verification,
  sign-in, protected-route return, and sign-out without a Production identity or
  data write.

Password recovery is independently closed until provider configuration is proven
to revoke every pre-existing identity session after reset and a two-session branch
test proves the reset token is single-use and both old sessions are rejected.
Normal signup, verification, sign-in, and sign-out do not expose recovery while
this evidence is absent.

The environment assertion `AUTH_EMAIL_DELIVERY_VERIFIED=verified` keeps live Auth
closed until the normal production email and lifecycle evidence is retained. The
separate `AUTH_PASSWORD_RESET_SESSION_REVOCATION=verified` assertion keeps only
recovery closed. Neither value is evidence on its own.

The 2026-08-30 disposable-branch test changed a synthetic password and consumed
its reset token but left all three pre-reset sessions valid. Adding an undocumented
`revokeSessionsOnPasswordReset` project-config key on that branch did not change
the result. Therefore the recovery assertion must remain unset until Neon exposes
and documents a working provider setting. Server identity reads bypass the SDK's
signed session-data cache, and middleware cache reuse is limited to the SDK's
shortest supported positive TTL (one second).

Provider signup, application user projection, and `active` buyer creation are
three distinct transitions. A verified provider session may project an internal
user only when the Auth and database adapters are enabled; age, structured
purpose, and current attestation acceptance are still required before the buyer
profile becomes `active`.

## Promotion and migration

Use reviewed commits, protected production deployment, environment-specific secrets, guarded ordered migrations, and a pre-deploy backup/restore plan. This repository currently exposes `db:generate` and `db:check` for source consistency only; it does **not** provide or authorize a Preview or Production migration-apply command. A future migration apply requires a separately reviewed command, exact target proof, backup/recovery evidence, and post-apply reconciliation. Never infer a passed integration, applied migration, external decision, or live behavior from local lint/tests.

## Safe modes

- Provider mode defaults disabled. Preview preparation remains browse-only even with syntactically valid test placeholders, and Production buyer checkout remains unavailable at this checkpoint. External acceptance/configuration is necessary but not sufficient for any later activation.
- Catalog projection defaults empty when real records are absent.
- The owner browse-only manifest defaults empty unless `BROWSE_CATALOG_PUBLICATION`
  exactly matches its recorded publication ID.
- Destination defaults unavailable when no active rule resolves.
- Tax/shipping absence denies hosted checkout.
- Fulfillment release remains disabled when the operating process or application prerequisites are unavailable.
- Public growth projections remain inactive when no active database policy is
  available. Production builds reject local growth drivers, fixed identities,
  synthetic economics, and test referral codes.
- Affiliate payouts are recorded only after an external operator supplies the
  bounded provider/reference evidence; this application has no provider-send
  effect.

## Recovery

1. Stop the narrow affected mutation path (checkout, webhook side effects, refunds, publication, or fulfillment).
2. Preserve correlation IDs, redacted logs, provider event IDs/hashes, deployment/commit/migration IDs, and relevant immutable journals.
3. Rotate exposed credentials and revoke affected staff sessions when applicable.
4. Restore or branch the database from an identified point, then reconcile provider/payment/inventory/refund/shipment events idempotently.
5. Validate integrity and replay safety in isolation before resuming.
6. Resume only the affected capability after owner approval and record the incident/recovery evidence.

For a growth-program incident, revoke the affected referral code or suspend the
affiliate, freeze new earning/redemption/commission mutations, preserve owner
history reads, and append reversals only from verified order/payment/refund or
chargeback facts. Never rewrite a reward, conversion, commission, payout, or
audit ledger to hide an error.

Do not delete journals or fabricate records to force systems to agree. Restore tests must verify order/payment/inventory/refund/review/shipment invariants and access denial.

## Rollback

Application rollback does not automatically reverse a database migration or provider effect. Prefer forward fixes; use a reviewed data migration when needed. A rollback must preserve compatibility with the deployed schema and journals, then rerun scoped verification and reconciliation before resuming writes.
