# System Architecture

## Boundaries

```text
Browser
  -> Next.js public/account/staff routes
    -> server actions and route handlers
      -> pure domain policies
        -> server-only repositories and adapters
          -> Clerk | Neon/Drizzle | Stripe-hosted Checkout | Blob | Resend
```

The browser may hold anonymous cart product IDs and quantities. It is never authoritative for identity, capability, buyer status, attestation version, price, discount, product state, destination, inventory, tax, shipping, payment, or fulfillment.

## Public and account flow

1. Public catalog projections expose only active manifest-backed products, prices, promotions, and supported quality records.
2. Anonymous cart state contains product IDs/quantities and survives Clerk sign-in.
3. Checkout collects a Clerk-verified account, age 21+, structured purpose, current attestation, and destination.
4. Completing account facts creates an `active` buyer automatically.
5. The server loads all six eligibility gates and the separate tax/shipping prerequisites.
6. Only an allowed decision creates hosted Checkout.

## Review flow

Review exists only for a buyer status or destination result explicitly equal to `review`. The server stores an immutable exact buyer/cart/destination snapshot hash. A capable MFA-authenticated administrator decides it. Any relevant input change requires a new snapshot; missing or blocked policy simply denies.

## Payment and fulfillment flow

Signed raw-body provider webhooks are the payment write boundary. Unique provider events append payment journal entries and drive idempotent inventory/email effects. The success route reads order state only. Fulfillment consumes once after rechecking payment, holds, inventory, buyer, product, and destination.

## Administration

Staff routes require an application capability and current Clerk MFA. One administrator may publish catalog, destination, promotion, and copy changes with an audit event. Refund and fulfillment mutations require their matching capability and MFA.

## Failure behavior

Unavailable database, identity verification, current attestation, manifest data, destination input, inventory, tax, shipping, or provider enablement denies the affected mutation. External legal/catalog/destination/tax/shipping/fulfillment/provider decisions are supplied outside the application; they are not synthesized as internal workflow state.

## Deployment shape

Local, Preview, and Production use separate configuration and provider resources. Production starts with catalog/payment/fulfillment unavailable until the named external inputs are verified. Server-only modules own secrets and provider SDKs; logs use correlation IDs and redact secrets, payment payloads, addresses, attestation text, and unnecessary PII.
