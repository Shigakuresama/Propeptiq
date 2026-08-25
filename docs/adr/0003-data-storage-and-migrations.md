# ADR 0003: Lean Relational Storage and Versioned Migrations

**Status:** Accepted, revised for V1 lightweight commerce on 2026-08-24.

## Context

The application needs transactional money/inventory behavior, versioned prices and attestations, deterministic destination rules, replay-safe provider events, exact review snapshots, and recoverability without modeling external business approvals as database workflows.

## Decision

Use Neon PostgreSQL with the Neon serverless driver and Drizzle ORM. Commit reviewed, ordered SQL migrations. Runtime uses a least-privilege role; migrations use a separate owner role.

Retain the lean records named in `docs/architecture/data-model.md`, including versioned attestations/prices, checkout attempts, provider/payment events, refunds, inventory events, immutable review snapshots, fulfillment releases, shipments, and admin audit.

Use Vercel Blob only for actual approved product media and optional lot/COA files. Store object metadata and lot linkage in Postgres. Serve nonpublic objects through authorized server routes; public COA projection is explicit.

## Integrity

- Use unique constraints and transactions for provider event identity, payment effects, inventory reservation/consumption, refunds, and shipment/release consumption.
- Preserve immutable order references to price and attestation versions.
- Restrict mutation/deletion of journals through the application role.
- Make migrations forward-safe, reject unknown schema state, and test against an isolated database before promotion.
- Backups, point-in-time recovery, and restore exercises are environment controls, not substitutes for business journals.

## Deliberate omissions

V1 does not store organization tenants/memberships, applicant files, identity material, jurisdiction substantiation chains, database launch-gate approvals, or publication-role choreography. Qualified legal review, catalog manifest, destination allowlist, tax/shipping setup, fulfillment operation, and provider acceptance remain external inputs; missing inputs keep application paths unavailable.

## Consequences

The schema stays focused on commerce integrity and replay safety. Adding a record requires a demonstrated invariant, query, retention owner, and migration/restore path; speculative workflow records are rejected.
