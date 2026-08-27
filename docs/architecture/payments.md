# Payments Architecture

## Provider boundary

Stripe-hosted Checkout is the first adapter, not a claim of business acceptance. Stripe's [official FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs) says research peptides require preventive measures against nonresearch purchasers and that account-activation review determines support. Live provider enablement remains an unresolved external launch input and maps to the `payment_provider` checkout gate.

## Checkout creation

The browser sends product IDs, quantities, destination, and promotion identifiers. The server:

1. authenticates the buyer and loads the current attestation;
2. reloads active products, versioned prices, promotions, destination rules, and inventory;
3. evaluates the six `CheckoutGate` values;
4. separately verifies tax configuration and shipping-service availability;
5. calculates integer-minor-unit totals and reserves inventory idempotently; and
6. creates hosted Checkout with an idempotency key and internal order reference.

Any missing or changed fact denies creation. Browser totals, provider redirect parameters, and cached catalog data are ignored.

## Webhooks and journal

- Verify the provider signature against the raw request body before parsing business fields.
- Store each provider event ID once with its payload hash, attempt count, lease data, and one of six durable statuses: `pending`, `processing`, `processed`, `failed`, `deferred`, or `conflict`. `pending` awaits a claim; `processing` owns an expiring lease; `processed` is the only terminal idempotent-success state; `failed` is retryable; `deferred` awaits a prerequisite and can be explicitly woken/reclaimed; and `conflict` is a terminal incident, never success.
- A same-ID/same-hash replay returns idempotent success only when status is `processed`. `pending`, `failed`, and `deferred` are reclaimable, as is `processing` after lease expiry. An unexpired `processing` replay remains busy and must not receive terminal success. A changed hash for the same provider event ID becomes `conflict`.
- In one transaction, append payment state changes to `payment_events`, apply required internal state transitions, durably enqueue downstream effects, and mark the provider event `processed`. A failure leaves or marks the event retryable; never mutate payment state from the success page.
- Downstream effects use their own idempotency keys. This checkpoint implements durable effect records and a lease-aware worker factory with injected-sink tests. It does not implement a runtime scheduler/wake-up, a production sink or Resend delivery, bounded backoff/dead-letter operations, alerts, a structured telemetry pipeline, external firewall configuration, or webhook rate limiting. Those absent operational controls are launch blockers, not implied by the repository or worker tests.
- Preserve unknown event types safely for reconciliation without treating them as payment success.

## Refunds

An authorized MFA-authenticated staff user may request a full or partial refund with a reason and idempotency key. The server verifies remaining refundable balance, records the request, calls the provider, and confirms state only from authoritative provider response/event evidence. Concurrent or duplicate requests cannot over-refund.

## Success and reconciliation

The return page reads internal order state and may say pending until a verified webhook arrives. Signed refund-reconciliation provider events can reconcile matching internal payment/refund state idempotently. There is no scheduled settlement fetch, authenticated reconciliation command, or period-closure system at this checkpoint. It never invents a paid state to match a redirect or dashboard appearance.

## Fulfillment separation

Payment does not authorize shipment by itself. Release rechecks verified payment, active holds, inventory, buyer status, product status, and current destination allowance, then consumes the release/shipment record once.
