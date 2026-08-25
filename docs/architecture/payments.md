# Payments, Webhooks, Refunds, and Reconciliation

**Status:** Stripe Checkout is the proposed baseline. Production payment activation is blocked pending provider and business/catalog approval.

## 1. Safety contract

- No guest checkout.
- No browser-calculated authoritative price or total.
- No card entry in PROPEPTIQ pages.
- No Checkout Session before every independent gate passes.
- No payment state transition from a redirect/success page.
- No fulfillment before verified payment plus current compliance clearance.
- Every provider request and event is idempotent and journaled.

Stripe’s current official FAQ says research-purpose peptides may be supported only with preventive measures that keep them inaccessible to nonresearch purchasers. Stripe independently reviews accounts and the live business/catalog; code and credentials do not constitute approval. See `docs/sources.md`.

## 2. Provider interface

```ts
type CheckoutRequest = {
  orderId: string
  currency: string
  lines: readonly { orderItemId: string; name: string; unitAmount: number; quantity: number }[]
  customerReference: string
  shippingAddress: PostalAddress
  idempotencyKey: string
}

interface PaymentProvider {
  createHostedCheckout(request: CheckoutRequest): Promise<{ providerSessionId: string; url: string }>
  verifyWebhook(rawBody: string, signature: string): Promise<VerifiedPaymentEvent>
  createRefund(request: RefundRequest): Promise<ProviderRefundResult>
  retrieveCheckout(providerSessionId: string): Promise<ProviderCheckoutState>
}
```

`DisabledPaymentProvider` is the production-safe default. It never fabricates success. `StripeCheckoutProvider` is constructed only with validated server secrets and an open payment launch gate.

## 3. Server-calculated order

The checkout action accepts only product IDs, quantities, selected destination, and attestation version/acceptance. In a transaction it reloads active products, active price-book rows, eligible lots, buyer approval, and policy versions. It computes integer minor-unit subtotal/tax/shipping/total server-side and persists immutable order-item/destination/eligibility snapshots.

If tax or shipping cannot be authoritatively calculated, the gate is `Unknown` and checkout stops. Stripe line data is created from the persisted order snapshot; browser-provided names/prices are ignored.

## 4. Checkout creation

1. Require authenticated approved principal and organization scope.
2. Require current checkout attestation.
3. Require all independent gates `PASS`.
4. Reserve eligible lot inventory atomically with an expiry.
5. Create/reuse an idempotency record derived from order and attempt.
6. Call Stripe Checkout with an explicit idempotency key and `order_id` metadata.
7. Persist provider session ID and URL; never log the URL if it contains sensitive query data.
8. Redirect the buyer to Stripe’s hosted page.

Allowed payment methods and countries are configured explicitly after provider approval. Delayed payment methods remain disabled unless their asynchronous states and inventory windows are separately approved.

## 5. Webhook inbox and journal

The route reads the raw request body, requires the Stripe signature header, and calls the SDK’s signature verifier with the endpoint secret. It then inserts `(provider, provider_event_id, payload_hash)` under a unique constraint.

- Duplicate event: return success after confirming the stored payload hash matches.
- New event: append a normalized payment journal row, transition the order under lock, and mark the inbox event processed in one durable transaction where possible.
- Handler failure: retain failure metadata and return an error so Stripe retries.

Handled baseline events include Checkout completion, asynchronous success/failure if later enabled, expiration, payment failure, refund update, and dispute/chargeback signals. Unrecognized signed events are journaled as ignored, not treated as success.

## 6. Verified payment transition

For a completion/success event, the server retrieves/validates provider state when necessary and compares:

- provider session/payment reference,
- internal order metadata,
- payment status,
- amount total,
- currency,
- customer reference,
- expected order state.

Mismatch creates a finance/compliance incident and cannot release fulfillment. A matching payment moves the order to `PaidPendingClearance`, then re-evaluates buyer, catalog, jurisdiction, provider, tax, shipping, inventory, compliance, and launch-control gates. Only all-`PASS` creates a one-time `fulfillment_release`.

## 7. Success and cancellation pages

The success URL may include the Checkout Session ID only to retrieve and display current server-side order status. It cannot write `paid`, allocate final inventory, send a fulfillment message, or create a fulfillment release. Cancellation/expiration releases reservations idempotently after authoritative provider state is known.

## 8. Refunds

Refund workflow:

1. Finance operator selects order/payment and enters a reason and amount.
2. Server checks capability, recent MFA, current refundable balance, compliance/fulfillment state, and policy.
3. Durable refund request and idempotency record are created before provider call.
4. Provider refund is requested with idempotency key.
5. Result/event is appended to payment journal; order reaches `Refunded` only from verified provider evidence.
6. Inventory, shipment interception, email, and accounting follow-up are explicit runbook actions, not hidden side effects.

The final return/refund policy and approval thresholds are unresolved launch decisions.

## 9. Reconciliation

Daily reconciliation compares internal orders/journal totals with Stripe balance transactions/Checkout state for the period. Exceptions include provider-only payments, internal-only paid state, amount/currency mismatch, missing/duplicate refunds, disputed payments, stale Checkout Sessions, and fulfillment without a release. Every exception opens an incident/finance case; reconciliation never silently edits journal history.

## 10. Test requirements

- Price tampering, quantity races, missing tax/shipping, and expired eligibility all deny checkout.
- Repeated checkout commands reuse/resolve idempotently and do not reserve inventory twice.
- Invalid signatures and payload changes are rejected.
- Duplicate/concurrent webhook delivery produces one journal effect and one fulfillment release.
- Success-page requests cannot mark payment.
- Paid-but-held orders cannot be fulfilled.
- Amount/currency mismatch cannot create a release.
- Refund retries do not create duplicate provider refunds.
- Reconciliation detects each exception class with deterministic fixtures kept only in test code.
