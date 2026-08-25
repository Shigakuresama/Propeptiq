# PROPEPTIQ LABS

PROPEPTIQ LABS is a production-oriented, compliance-first commerce platform for legitimate laboratory and research use. It is not a human-use or veterinary-use storefront.

## Current status

The application is being built from a new workspace. Production commerce is intentionally disabled until every launch gate in this repository is backed by current documentary evidence and an accountable approval.

This repository uses four evidence labels:

- **Confirmed:** directly required by the project objective, observed in the repository, or supported by a cited primary source.
- **Proposed:** an architecture or operating choice selected for implementation but not a business/legal fact.
- **Unresolved:** a decision that requires an owner and evidence before activation.
- **Launch gate:** a condition that must block a production capability until resolved.

## Non-negotiable behavior

- Products are for legitimate laboratory/research use only—not for human consumption, human use, or veterinary use.
- No dosage, reconstitution, injection, treatment, weight-loss, bodybuilding, anti-aging, therapeutic, structure/function, or human-outcome claims.
- No guest checkout.
- Researcher or organization approval, intended-use attestation, product eligibility, destination eligibility, compliance clearance, verified payment, and fulfillment release are separate gates.
- Missing jurisdiction policy resolves to `Unknown`; `Unknown` never permits checkout.
- Prices and totals are calculated on the server from active catalog records.
- Card details are collected only through hosted checkout.
- A signed, deduplicated provider webhook—not a success-page redirect—establishes payment status.
- Product identity, purity, test method, lot, and COA claims render only from approved records and actual batch evidence.
- The repository contains no invented saleable products, prices, inventory, purity values, laboratories, certifications, testimonials, approvals, or shipping permissions.

## Selected stack

The baseline stack is:

- Next.js App Router with React and strict TypeScript
- Tailwind CSS and shadcn/ui on Radix primitives
- Clerk managed authentication and Organizations; production MFA required, with server-side step-up checks for sensitive administrative actions
- Neon PostgreSQL through the Neon serverless driver
- Drizzle ORM and versioned SQL migrations
- A centralized server-only data access/authorization layer
- Stripe-hosted Checkout behind a provider abstraction and disabled-by-default launch gate
- Private Vercel Blob storage for approved product media and lot-level COAs
- Resend transactional email behind a provider abstraction
- Vercel environments, Firewall rate limiting, structured JSON logs, and OpenTelemetry/Vercel Observability
- Neon point-in-time recovery plus tested logical backup/restore procedures
- Vitest, Testing Library, Playwright, and accessibility checks

Architecture decisions and vendor constraints are recorded in `docs/adr/` and `docs/architecture/`.

## Local setup

Prerequisites:

- Node.js 24.x
- npm 11.x
- PostgreSQL access only when exercising database-backed routes

After the scaffold is present:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The default local state keeps authentication-dependent operations, external messages, object writes, and payments disabled until real development credentials are configured. Never commit `.env.local` or paste secrets into issues, documentation, tests, or chat.

Quality gates:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run db:check
```

Database changes follow this sequence:

```powershell
npm run db:generate
npm run db:check
npm run db:migrate
```

`db:migrate` must target the intended environment explicitly. Production migrations require the deployment runbook and a verified restore point.

## Environment boundaries

- **Local:** no production data or credentials; external providers default disabled.
- **Preview:** isolated Clerk/Neon/provider resources, synthetic test identities, no real fulfillment, no live payment credentials.
- **Production:** separately scoped secrets, protected branch/deployment, reviewed migrations, monitoring/alerts, backup verification, and all launch gates satisfied.

## Documentation map

- Product and acceptance criteria: `docs/product-requirements.md`
- Current source register: `docs/sources.md`
- Reference-site/product taxonomy audit: `docs/research/reference-site-audit.md`
- System boundaries and diagrams: `docs/architecture/system-architecture.md`
- Data model and invariants: `docs/architecture/data-model.md`
- Authentication and authorization: `docs/architecture/authentication-authorization.md`
- Payments, webhooks, refunds, and reconciliation: `docs/architecture/payments.md`
- Catalog and compliance policy: `docs/compliance/catalog-policy.md`
- Jurisdiction matrix: `docs/compliance/jurisdiction-matrix.md`
- Threat model and secrets: `docs/security/threat-model.md`
- Environments, migrations, rollback, and backups: `docs/deployment/environments-and-recovery.md`
- Test strategy: `docs/testing.md`
- Operational runbooks: `docs/runbooks/`
- Implementation plan: `docs/superpowers/plans/2026-08-24-propeptiq-labs-platform.md`

## Unresolved decisions

No source currently establishes the final SKU catalog, business-entity state, warehouse/fulfillment state, licenses, approved shipping matrix, tax registrations/nexus, production email domain, provider accounts, or return/refund policy. Wyoming is only a provisional formation candidate and confers no peptide-law exemption.

These decisions are represented as explicit launch gates; they are not filled with defaults.

## Production launch gates

Production sale and fulfillment remain blocked until, at minimum:

1. Counsel approves the entity, each SKU, intended-use presentation, and product-by-jurisdiction matrix.
2. Actual suppliers, lots, test evidence, COAs, product media, labels, and inventory are approved and loaded.
3. Stripe or the selected provider confirms the actual business/catalog is supportable; live credentials alone are not approval.
4. Tax registrations/nexus, shipping services, warehouse controls, returns, and refund procedures are approved.
5. Clerk production settings, required MFA, admin assignments, and organization enrollment controls are verified.
6. Production secrets, rate limits, alerts, backups, restore tests, audit protections, and incident contacts are verified.
7. End-to-end controlled tests prove that blocked/unknown eligibility cannot pay and paid-but-held orders cannot fulfill.

This repository is engineering documentation and software, not legal advice. Legal and regulatory decisions require qualified counsel with the actual catalog and operating facts.
