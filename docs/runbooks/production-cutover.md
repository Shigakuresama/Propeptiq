# Production Cutover

Provision the external providers and move the capability gates from `disabled` to
`live`. This runbook covers configuration only. It does not authorize applying a
migration to a populated database, publishing catalog truth, or activating live
checkout on evidence this repository cannot produce.

## Shared rules

- Every capability defaults to `disabled` and is validated in `src/config/env-schema.ts`. Never add a default that opens a capability.
- Provision Preview and Production as separate provider instances with separate credentials. A Preview credential must never reach Production.
- Record each provisioning step with its actor, timestamp, and the exact resource identifier. Redact secret values.
- Adapter selection and live attestation are independent. Setting a mode to `live` does not by itself open checkout.

## 1. Clerk

Create separate test and production instances.

1. Configure the verified email sender, production domains, and redirect origins on the production instance. A domain not registered here fails sign-in.
2. Require MFA for every administrator. Staff, refund, and fulfillment mutations assume current MFA.
3. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The secret must never carry the `NEXT_PUBLIC_` prefix.
4. Set `CLERK_WEBHOOK_SIGNING_SECRET` only when the Clerk webhook is configured. An unsigned or unverified webhook is not evidence of anything.

Set `AUTH_MODE=live` only after the production instance is verified.

## 2. Neon PostgreSQL

Provision isolated Preview and Production databases with separate runtime and
migration-owner roles. The runtime role must not hold migration rights.

- Preview: set `TEST_DATABASE_URL` plus `TEST_DATABASE_CONFIRMATION=isolated-test-database`. `npm run test:postgres:checkout` refuses to run without both, by design. Point it only at a disposable database.
- Production: set `DATABASE_URL` to the pooled runtime connection. `src/db/runtime.ts` reads it when `DATABASE_MODE=live`.

`DATABASE_MIGRATION_URL` is reserved and currently unread. `drizzle.config.ts`
declares no `dbCredentials`, and there is no `db:migrate` script. Setting it
changes nothing.

### Applying migrations

**This repository does not provide a live migration command, and that is
deliberate.** See `src/db/migrations/README.md`. Migrations `0001` through `0004`
open with fail-closed preflights that abort rather than invent data:

- `0001` aborts on a populated v0 `products` table; no truthful `material_identity` can be inferred.
- `0002` aborts on a populated `refunds` table until each legacy refund is mapped to its verified source payment event.
- `0003` refuses populated `orders` or `provider_events`; structured addresses, buyer-scoped attempts, and normalized provider events cannot be reconstructed honestly.
- `0004` refuses any `0003` checkout attempt already carrying provider authority.

Applying these to a real database is a separately authorized, reviewed operator
process owned by an accountable operator, performed with the migration-owner
role over a direct (non-pooled) connection. Deleting rows or substituting a
generic value to get past a preflight is not an approved workaround.

`npm run db:check` validates local Drizzle schema history only. It never
connects. It is not evidence that any database was migrated.

## 3. Vercel Blob

Create a **private** store and set `BLOB_READ_WRITE_TOKEN`. Set `STORAGE_MODE`
to `test` or `live`; both the verifier and the writer refuse to operate while it
is `disabled`.

### COA import

COA evidence enters through the owned manifest ingest, not an ad-hoc upload.
`importCoaFromManifest` (`src/admin/admin-service.ts`) requires the
`catalog.publish` capability, then `ingestCoaObject`
(`src/security/coa-ingest.ts`) enforces, in order:

1. The manifest hash is lowercase SHA-256 and the object is non-empty and within 25 MB.
2. The bytes are hashed here. A manifest digest is never taken on trust; a mismatch aborts before any write.
3. An existing object at the same key is never replaced. A matching digest is idempotent; a differing digest aborts.
4. The write is confirmed by reading the object back through the same verifier that gates publication.

Only then is a draft row recorded, with a `catalog.coa.imported` audit event. A
recorded COA therefore cannot point at evidence the store does not hold.

Publication remains a separate step: `publishCoaDocument` re-verifies the stored
object against the manifest hash before anything becomes public.

## 4. Capability activation

Live checkout requires **all** of the following
(`isLiveCheckoutEnvironmentConfigured`, `src/config/commerce-capability.ts`):

- Production identity: `APP_ENV=production`, or `VERCEL_ENV`/`VERCEL_TARGET_ENV` equal to `production`.
- `CATALOG_DEMO_MODE=disabled`.
- `AUTH_MODE`, `DATABASE_MODE`, `PAYMENTS_MODE`, `TAX_MODE`, `SHIPPING_MODE`, and `FULFILLMENT_MODE` all `live`.
- Both attestations enabled: `COMMERCE_LIVE_CAPABILITY=enabled` and `PAYMENTS_LIVE_CAPABILITY=enabled`.

`STORAGE_MODE` is not part of this gate. `EMAIL_MODE` is part of the exact
`isLiveCheckoutEnvironmentConfigured` contract and must be `live` alongside
`AUTH_MODE`; the environment schema also requires `RESEND_API_KEY` and
`RESEND_FROM` for that live transactional-email capability. This Better Auth
email support is not a newsletter subscriber gateway, and it does not by
itself authorize newsletter collection.

`LOCAL_TEST_DRIVER` and `CATALOG_DEMO_MODE` must remain `disabled` under a
production build identity; `next.config.ts` throws at config time otherwise.

## 5. Verification

```powershell
npm run verify                       # boundary -> lint -> typecheck -> test -> build
npm run verify:production-artifacts  # scan built output for test-only sentinels
```

Confirm before opening traffic:

- The built output contains no test-only sentinel.
- A signed provider webhook, deduplicated and journaled, is what establishes payment. A success-page redirect never is.
- Missing or unclassified jurisdiction resolves to `Unknown`, and `Unknown` never permits checkout.
- Production catalog rows come from a real owner manifest. No invented product, price, purity, lot, supplier, lab, certification, review, or shipping promise.

The two buyer-activation pieces remain separate launch inputs: production
checkout-page readiness and an authoritative live cart/preview bridge. The
checkout page preserves its account, attestation, environment, destination,
inventory, tax, shipping, payment, and provider gates; the public preview cart
is not a production checkout authorization.

## What this runbook does not prove

Passing `src/domain/content-policy.ts` is defense in depth, not publication
approval. PGlite integration tests prove schema and constraint behavior only;
they are not evidence of real PostgreSQL isolation or concurrency. A lane that
was not run is reported as not run, with no claim.
