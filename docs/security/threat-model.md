# Threat Model

**Status:** Binding design controls; production effectiveness remains to be verified.

## Assets and trust boundaries

Protect identities, buyer status, attestations, addresses, authoritative catalog/prices/promotions, destination rules, inventory, provider events, payment/refund journals, review snapshots, fulfillment records, audit events, secrets, and approved COA objects.

The browser, Clerk, Stripe, email, object storage, databases, staff devices, and fulfillment operation are separate trust boundaries. Browser data and provider redirects are untrusted. Signed identity/payment messages are verified server-side and remain subject to application policy.

## Primary threats and controls

| Threat | Required controls |
|---|---|
| Nonresearch purchaser misrepresentation | Verified email, age/purpose/current attestation, buyer block/review states, destination/product controls, audit and incident response |
| Human-use positioning | Prohibited-content policy across overall impression, analytical-claim evidence linkage, content tests, rapid unpublish |
| Catalog fabrication or test-data leak | Real-manifest production import, production demo-mode hard failure, public active-record projection |
| Destination fail-open | Exact product/state → policy-group/state → unavailable; territories unavailable; denial tests |
| Broken object authorization | Principal-bound repositories, own-order checks, opaque identifiers as defense-in-depth, negative tests |
| Staff account takeover | Current MFA for staff routes/refunds/fulfillment, least capability, session revoke, rate limits, alerts |
| Price/promotion tampering | Server reload and integer-money calculation, order version references, hosted collection |
| Webhook forgery/replay | Raw-body signature verification, unique provider event/hash, idempotent downstream effects |
| Success-page spoofing | Read-only return page; payment writes from verified provider evidence only |
| Inventory/refund/shipment race | Transactions, uniqueness, remaining-balance/quantity checks, consume-once records |
| COA/object misuse | Minimal allowed types/size, private storage by default, lot linkage, safe response headers, no executable rendering |
| Secret/PII leakage | Server-only modules, scoped environment variables, redacted correlated logs, minimal collection/retention |
| Dependency/build compromise | Lockfile, official packages, reviews, audit, isolated environments, protected deployments |

## Authorization model

V1 users are individual Clerk principals. Optional organization name is never an authorization scope. Public reads expose only active public projections. Buyer mutations require authentication and resource ownership. Staff mutations require explicit application capability and current MFA. One capable administrator may publish; the security objective is authenticated, authorized, auditable action—not multiple actors.

## Review and denial

Review work exists only for buyer status `review` or destination result `review`. A decision is immutable and bound to the exact buyer/cart/destination snapshot. Missing, blocked, malformed, or unavailable facts deny without creating work. Rate limiting and alerting apply to repeated account, checkout, webhook, refund, and staff mutation failures.

## External limitations

Software cannot determine SKU legality, supply real catalog facts, configure tax/shipping, operate a warehouse, or guarantee payment-provider acceptance. Those external launch inputs require accountable owners. Their absence fails closed and is not evidence of an application defect or an invitation to fabricate a workflow record.
