# System Architecture

## Boundaries and target topology

```text
Browser
  -> Next.js public/account/staff routes
    -> server actions and route handlers
      -> pure domain policies
        -> server-only repositories and adapters
          -> Better Auth + Resend | Neon PostgreSQL/Drizzle | Stripe-hosted Checkout | Blob
```

The final adapter line is the target topology, not a claim that those vendor
accounts, resources, or production integrations have been provisioned. At this
checkpoint Preview is prepared only as an unpublished, unprovisioned,
browse-only environment, and Production buyer checkout remains inert.

The browser may hold anonymous cart product IDs and quantities. It is never authoritative for identity, capability, buyer status, attestation version, price, discount, product state, destination, inventory, tax, shipping, payment, or fulfillment.

## Public and account flow

1. Public catalog projections expose only active manifest-backed products, prices, promotions, and supported quality records.
2. Anonymous cart state contains product IDs/quantities and survives Better Auth sign-in.
3. Checkout collects a provider-verified account, age 21+, structured purpose, current attestation, and destination.
4. Completing account facts creates an `active` buyer automatically.
5. The server loads all six eligibility gates and the separate tax/shipping prerequisites.
6. Only an allowed decision creates hosted Checkout.

## Review flow

Review exists only for a buyer status or destination result explicitly equal to `review`. The server stores an immutable exact buyer/cart/destination snapshot hash. A capable MFA-authenticated administrator decides it. Any relevant input change requires a new snapshot; missing or blocked policy simply denies.

## Payment and fulfillment flow

Signed raw-body provider webhooks are the payment write boundary. Unique provider events append payment journal entries and create durable, idempotent downstream-effect records. The implemented library includes the effect repository and a lease-aware worker factory exercised with an injected test sink; there is no runtime scheduler/wake-up, production sink or Resend delivery, bounded backoff/dead-letter operation, alerting, or production telemetry pipeline. The success route reads order state only. Fulfillment consumes once after rechecking payment, holds, inventory, buyer, product, and destination.

## Administration

Staff routes require an application capability and current server-verifiable MFA. One administrator may publish catalog, destination, promotion, and copy changes with an audit event. Refund and fulfillment mutations require their matching capability and MFA. Until the Better Auth adapter can project that MFA evidence, its staff access fails closed.

## Failure behavior

Unavailable database, identity verification, current attestation, manifest data, destination input, inventory, tax, shipping, or provider enablement denies the affected mutation. External legal/catalog/destination/tax/shipping/fulfillment/provider decisions are supplied outside the application; they are not synthesized as internal workflow state.

## Deployment shape

Local, Preview, and Production are designed to use separate configuration and provider resources. That separation is a deployment requirement, not evidence that Preview or Production resources exist. Preview is currently prepared but not published or provisioned and is browse-only; Production buyer checkout and fulfillment remain unavailable. Server-only modules own secrets and provider SDKs. Correlation/redaction requirements remain binding, while a production structured telemetry pipeline is not yet implemented.
