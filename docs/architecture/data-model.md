# Lean V1 Data Model

**Status:** Binding conceptual schema. Migration files remain the executable database truth after implementation.

## Required records

| Record | Purpose and load-bearing fields |
|---|---|
| `users` | Internal user ID, unique external identity ID, email lifecycle state. The executable schema temporarily retains the legacy `clerk_id` SQL column name for compatibility. |
| `buyer_profiles` | User ID, `active | review | blocked`, age confirmation, structured purpose, optional organization name |
| `attestations` | Versioned policy text/hash and immutable buyer acceptance |
| `staff_roles` | Individual user capabilities; no tenant or membership projection |
| `product_policy_groups` | Shared destination-policy classification |
| `products` | Core identity, package/form, policy group, active state |
| `product_prices` | Immutable/versioned amount and currency records |
| `lots` | Product/supplier traceability and inventory facts |
| `coa_documents` | Optional lot-linked analytical evidence and public projection metadata |
| `destination_policies` | Active exact product/state override or policy-group/state rule |
| `promotions` | Server-owned discount, bundle, subscription, loyalty, or cross-sell configuration |
| `orders`, `order_items` | Buyer/destination snapshots, authoritative totals, version references |
| `checkout_attempts` | Idempotency, gate decision, tax/shipping prerequisite result, provider request linkage |
| `provider_events`, `payment_events` | Unique provider delivery plus append-only payment journal |
| `inventory_events` | Reservation, release, and consume-once movements |
| `refunds` | Requested/confirmed amounts, provider linkage, idempotency |
| `review_requests` | Immutable buyer/cart/destination snapshot hash and decision |
| `fulfillment_releases`, `shipments` | Consume-once release and shipment records |
| `admin_audit` | Actor, action, resource, timestamp, correlation ID, redacted metadata |

## Deliberate omissions

V1 has no organization tenants, organization membership projection, applicant-document records, identity-document pipeline, jurisdiction evidence chain, database launch-gate table, publication chain, or database role-separation trigger. External launch inputs remain configuration/operations evidence outside this schema.

## Integrity invariants

- Attestation and price versions referenced by an order are immutable.
- Provider event identity is unique; the same identity with a different payload hash is a conflict.
- Payment journal entries append and never derive from return-page navigation.
- Inventory reservation, release, and consumption use unique idempotency keys and cannot consume below zero.
- Refund confirmation cannot exceed the remaining refundable amount and is idempotent.
- Review decisions bind to one exact buyer/cart/destination snapshot hash; changed inputs cannot reuse them.
- Fulfillment release and shipment consumption happen once.
- Destination rule uniqueness prevents two active rules for the same scope/state; exact product rules take precedence in domain logic.
- Production catalog rows originate from a real manifest; test fixtures cannot migrate into production.

## External inputs

The schema cannot prove legal permission, catalog truth, tax correctness, shipping availability, warehouse readiness, or provider acceptance. Missing verified inputs keep affected activation, checkout, or fulfillment paths unavailable.
