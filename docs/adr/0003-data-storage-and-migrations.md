# ADR 0003: Database, Object Storage, and Migration Strategy

- **Date:** 2026-08-24
- **Status:** Accepted for implementation; production resources gated

## Context

The platform requires relational integrity, transactions, append-only journals, tenant scoping, versioned policy/catalog records, inventory, lot/COA linkage, private evidence files, and recoverability.

## Decision

Use Neon PostgreSQL with the Neon serverless driver and Drizzle ORM. Drizzle schema and reviewed, versioned SQL migrations are committed. Runtime uses a least-privilege application role; migrations use a separate owner role. Immutable business journals receive database triggers preventing update/delete by the application path.

Use private Vercel Blob stores for application evidence, approved product media, and COAs. Persist object metadata, SHA-256, authorization, and version/lot linkage in Postgres; deliver private objects through authenticated server routes.

Use Neon point-in-time recovery plus scheduled encrypted logical backups outside the primary database failure domain and periodic restore tests.

## Consequences

- PostgreSQL supports the required transactions/constraints/audit relationships.
- Serverless HTTP is efficient for one-shot queries; multi-statement transactional operations must use a transaction-capable connection path.
- Private object delivery consumes function bandwidth and requires explicit access checks.
- Backup retention/RPO/RTO depend on selected production plans and must be proven.

## Alternatives

- SQLite/D1: rejected because the binding requirement selects Neon PostgreSQL and the transaction/operations model is Postgres-oriented.
- Public object URLs: rejected for applicant evidence and nonpublic COAs.
- Browser storage: rejected as nonauthoritative.
