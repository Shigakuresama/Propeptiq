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
- Store each provider event ID once with a payload hash. Replay of the same ID/hash returns success without duplicate effects; the same ID with a different hash is an incident.
- Append payment state changes to `payment_events`; never mutate payment state from the success page.
- Perform order, inventory, email, refund, and fulfillment side effects with their own idempotency keys.
- Preserve unknown event types safely for reconciliation without treating them as payment success.

## Refunds

An authorized MFA-authenticated staff user may request a full or partial refund with a reason and idempotency key. The server verifies remaining refundable balance, records the request, calls the provider, and confirms state only from authoritative provider response/event evidence. Concurrent or duplicate requests cannot over-refund.

## Success and reconciliation

The return page reads internal order state and may say pending until a verified webhook arrives. Scheduled reconciliation compares internal totals/states with provider events and settlements using redacted identifiers. It never invents a paid state to match a redirect or dashboard appearance.

## Fulfillment separation

Payment does not authorize shipment by itself. Release rechecks verified payment, active holds, inventory, buyer status, product status, and current destination allowance, then consumes the release/shipment record once.
