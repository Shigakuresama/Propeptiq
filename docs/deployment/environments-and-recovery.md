# Deployment, Environments, Migrations, Rollback, and Backups

**Status:** Proposed operating model. No production project or credentials are assumed to exist.

## 1. Environments

| Environment | Data/providers | Allowed behavior |
|---|---|---|
| Local | local/test-only identities and nonproduction database branch; external providers disabled unless explicitly configured | development and automated tests; never real fulfillment |
| Preview | isolated Clerk/Neon/Blob/Resend/Stripe test resources | review with synthetic test identities; no live payment, customer message, or shipment |
| Production | dedicated least-privilege resources and secrets | public read paths initially; commerce only after launch gates |

Never share production database credentials, Clerk instance, Stripe live keys, Blob token, or email sender credentials with Preview.

## 2. Vercel deployment

- `main` is the production source branch after Git is initialized and protections are configured.
- Every change receives lint, strict typecheck, tests, migration check, build, and browser validation.
- Preview deployments use safe provider modes and no production data.
- Production promotion requires an approved change record when schema, compliance policy, payments, or fulfillment changes.
- Structured logs and OpenTelemetry instrumentation are active before commerce activation.
- Vercel Firewall rules are configured and observed in Preview before Production.

## 3. Configuration validation

The application validates configuration by environment and capability:

- Public-only mode can build without external credentials and shows commerce unavailable.
- Protected identity mode requires Clerk keys/configuration.
- Database mode requires the intended Neon URL and runtime role.
- Storage/email providers require their server tokens only when enabled.
- Payment mode defaults `disabled`; `test` requires test keys; `live` additionally requires open database launch gates and live-provider evidence.
- Production rejects wildcard/localhost origins and unsafe debug flags.

## 4. Migrations

1. Change the Drizzle schema and a focused migration test.
2. Generate versioned SQL.
3. Inspect SQL for locks, rewrites, destructive operations, privilege changes, and append-only protections.
4. Apply to an isolated Neon branch restored from representative schema/data.
5. Run application tests and migration verification.
6. Record forward and rollback/roll-forward procedure.
7. Create/verify recovery point.
8. Apply production migration with explicit target and monitoring.

Application releases use expand/migrate/contract sequencing for incompatible changes. Destructive column/table removal is a later release only after code no longer reads/writes it and retention approval exists.

## 5. Rollback

- UI/application regression without schema incompatibility: promote the last known-good deployment.
- Forward-compatible schema issue: deploy a roll-forward migration rather than destructive reversal.
- Data-corruption risk: stop protected writes/payment/fulfillment via launch gates, capture evidence, choose point-in-time branch/restore, reconcile provider events, and only then resume.
- Payment webhook regression: retain signed event retries/inbox, disable checkout, deploy fix, replay/reconcile idempotently.
- Compliance-policy regression: move affected gate to closed/Unknown and hold unfulfilled orders.

Rollback never deletes audit/payment/decision history.

## 6. Backups and recovery

Baseline:

- Neon point-in-time recovery/branching configured with retention appropriate to the selected plan.
- Scheduled logical PostgreSQL backup encrypted and stored outside the primary database failure domain.
- Private object storage versioning/retention policy for approved product media and COAs.
- Source/migrations in version control.
- Provider exports/reconciliation preserve external payment references.

Proposed objectives until business impact analysis approves them:

- Database RPO: 15 minutes or better.
- Database RTO: 4 hours or better.
- COA/media RPO: object-version durability; recovery verified quarterly.

These are proposed engineering targets, not confirmed vendor commitments. Production plan selection must prove they are achievable.

## 7. Restore drill

At least quarterly and before commerce launch:

1. Restore database to an isolated branch/time.
2. Validate schema version and row counts/hashes for critical journals.
3. Validate application read paths with isolated credentials.
4. Restore representative private objects and verify hashes/authorization.
5. Reconcile a controlled set of payment references without causing provider writes.
6. Record achieved RPO/RTO, gaps, owner, and remediation.
7. Destroy isolated recovery credentials/resources after evidence is retained.

## 8. Release gate checklist

- Required primary-source/vendor facts rechecked.
- Approved migration and recovery point.
- All automated gates green.
- Accessibility/responsive/browser verification complete.
- Observability, alerts, and rate limits verified.
- Secrets/roles reviewed.
- Payment/catalog/jurisdiction/tax/shipping/fulfillment gates remain closed unless their actual evidence is approved.
