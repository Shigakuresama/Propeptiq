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

## Implemented signed-event reconciliation

Verified signed refund-reconciliation provider events can update matching
internal payment/refund state through the idempotent provider-event boundary.
Use immutable provider/internal IDs, integer amounts, event hashes, durable
statuses, and the append-only journals to investigate an event result. Do not
infer a refund from a redirect or provider-dashboard appearance.

## Settlement reconciliation is not implemented

This checkpoint has no runtime scheduler, provider settlement fetch,
authenticated operator reconciliation command, period-close evidence system,
or period-close authorization. The following are future operational reporting
requirements, not a runnable in-application procedure:

- paid/provider mismatch;
- duplicate or conflicting provider events;
- missing or delayed webhooks;
- refunds pending or exceeding internal remaining balance;
- chargeback/dispute state not reflected internally;
- inventory or fulfillment effects inconsistent with verified payment/refund state.

## Exceptions

Freeze only the affected refund/order/fulfillment mutation, preserve redacted evidence, and reconcile through append-only corrective events. Never rewrite journal history. Escalate provider acceptance/availability to the provider owner and tax/accounting interpretation to the responsible external owner.

## Closure boundary

The application cannot close an accounting or settlement period at this
checkpoint. A responsible external owner may document an investigation and
residual risk, but that record is not application-generated period-close
evidence. Implementing and authorizing period closure requires a separately
reviewed settlement-reconciliation system.
