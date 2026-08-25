# Refunds and Reconciliation

## Refund procedure

1. Authenticate with refund capability and current MFA.
2. Load the order, verified payment journal, currency, prior refunds/disputes, remaining refundable amount, and fulfillment state.
3. Record a refund request with amount, reason, correlation ID, and unique idempotency key.
4. Reject zero, negative, currency-mismatched, or over-balance requests and concurrent duplicates.
5. Call the provider with the same idempotency key. Treat timeout as unknown; query before retrying.
6. Append provider result/event and payment/refund journal entries. Do not infer completion from a browser redirect or dashboard appearance.
7. Apply inventory or fulfillment consequences only through their dedicated idempotent policies.
8. Read back order, payment, refundable balance, refund, inventory, and shipment state.

## Reconciliation

On the scheduled cadence, compare internal orders/payment/refund journals with authoritative provider events and settlement records by immutable IDs and integer amounts. Report at least:

- paid/provider mismatch;
- duplicate or conflicting provider events;
- missing or delayed webhooks;
- refunds pending or exceeding internal remaining balance;
- chargeback/dispute state not reflected internally;
- inventory or fulfillment effects inconsistent with verified payment/refund state.

## Exceptions

Freeze only the affected refund/order/fulfillment mutation, preserve redacted evidence, and reconcile through append-only corrective events. Never rewrite journal history. Escalate provider acceptance/availability to the provider owner and tax/accounting interpretation to the responsible external owner.

## Closure

Close a period only when every exception is resolved or explicitly owned with residual risk. Record counts/totals by currency, settlement references, refund/dispute totals, unresolved items, owner, and timestamp.
