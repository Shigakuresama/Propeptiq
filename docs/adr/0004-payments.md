# ADR 0004: Hosted Payments Behind a Disabled-by-Default Provider Boundary

- **Date:** 2026-08-24
- **Status:** Accepted for implementation; live activation gated

## Context

Card handling should remain outside the application. Stripe’s official current FAQ says research-purpose peptides require preventive measures and account review determines supportability. Payment, compliance, and fulfillment must remain separate.

## Decision

Define a server-only `PaymentProvider` interface. Implement a production-safe disabled provider and a Stripe Checkout adapter. Use Stripe-hosted Checkout, server-derived line prices, explicit idempotency keys, raw-body signature verification, unique webhook inbox, append-only payment journal, and signed refund-reconciliation provider-event handling.

Payment mode defaults to disabled. Production buyer checkout remains inert at
this checkpoint regardless of environment flags. External entity/catalog/
provider acceptance, jurisdictions, tax, shipping, fulfillment, monitoring,
and recovery evidence are necessary but not sufficient for a later separately
authorized activation. Success/return pages are read-only status surfaces.

There is no scheduled settlement reconciliation, provider settlement fetch,
authenticated operator reconciliation command, period-close evidence system,
or period-close authorization. Those are future operational capabilities, not
implied by signed refund-event handling.

## Consequences

- Application never receives card data.
- Provider can be replaced without changing domain state machines.
- A paid order may remain on hold and require refund; operations must manage this explicitly.
- Credentials or a functioning API call never imply business eligibility.

## Alternatives

- Embedded/custom card form: rejected due to wider PCI/security surface.
- Payment Links without order orchestration: rejected because prices, eligibility, journals, and fulfillment release must be authoritative and correlated.
- Crypto/alternate processors: outside current approved scope.
