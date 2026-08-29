# Threat Model

**Status:** Binding design controls; production effectiveness remains to be verified.

## Assets and trust boundaries

Protect identities, buyer status, attestations, addresses, authoritative catalog/prices/promotions, destination rules, inventory, provider events, payment/refund journals, review snapshots, fulfillment records, rewards balances, referral and affiliate attribution, commission and payout records, versioned growth terms, audit events, secrets, and approved COA objects.

The browser, Clerk, Stripe, email, object storage, databases, staff devices, and fulfillment operation are separate trust boundaries. Browser data and provider redirects are untrusted. Signed identity/payment messages are verified server-side and remain subject to application policy.

## Primary threats and controls

| Threat | Required controls |
|---|---|
| Nonresearch purchaser misrepresentation | Verified email, age/purpose/current attestation, buyer block/review states, destination/product controls, audit and incident response |
| Human-use positioning | Prohibited-content policy across overall impression, analytical-claim evidence linkage, content tests, rapid unpublish |
| Catalog fabrication or test-data leak | Real-manifest production import, production demo-mode hard failure, public active-record projection |
| Destination fail-open | Exact product/state → policy-group/state → unavailable; territories unavailable; denial tests |
| Broken object authorization | Principal-bound repositories, own-order checks, opaque identifiers as defense-in-depth, negative tests |
| Staff account takeover | Current MFA and least capability for staff routes/refunds/fulfillment; session-response procedures; database-backed limits on implemented mutation paths; operational alerts remain unimplemented |
| Price/promotion tampering | Server reload and integer-money calculation, order version references, hosted collection |
| Referral or affiliate forgery/enumeration | Opaque codes, signed environment-bound 30-day first-party attribution cookies, exact-origin mutation checks, privacy-minimal per-code HMAC rate limiting, server-side status lookup, self-referral denial, and uniform invalid/inactive responses |
| Duplicate growth value | One referral-or-affiliate attribution per order, exact policy/version snapshots, immutable idempotency keys and request hashes, provider/refund/shipment lifecycle facts, uniqueness constraints, and transactional ledger writes |
| Terms substitution | Exactly one current database version, server-computed SHA-256 content hash, exact acceptance foreign keys, and rollback on missing, overlapping, or mismatched terms |
| Commission or payout replay | Staff capability and current MFA, rate limits, compare-and-set transitions, immutable command idempotency, one-time commission consumption, and truthful external provider/reference evidence |
| Webhook forgery/replay | Raw-body signature verification, unique provider event/hash, idempotent downstream effects; webhook rate limiting and external firewall configuration remain unimplemented launch controls |
| Success-page spoofing | Read-only return page; payment writes from verified provider evidence only |
| Inventory/refund/shipment race | Transactions, uniqueness, remaining-balance/quantity checks, consume-once records |
| COA/object misuse | Minimal allowed types/size, private storage by default, lot linkage, safe response headers, no executable rendering |
| Secret/PII leakage | Server-only modules, scoped environment variables, redaction requirements, minimal collection/retention; a production structured telemetry pipeline is not yet implemented |
| Dependency/build compromise | Lockfile, official packages, reviews, audit, isolated environments, protected deployments |

## Authorization model

V1 users are individual Clerk principals. Optional organization name is never an authorization scope. Public reads expose only active public projections. Buyer mutations require authentication and resource ownership. Staff mutations require explicit application capability and current MFA. One capable administrator may publish; the security objective is authenticated, authorized, auditable action—not multiple actors.

## Review and denial

Review work exists only for buyer status `review` or destination result `review`. A decision is immutable and bound to the exact buyer/cart/destination snapshot. Missing, blocked, malformed, or unavailable facts deny without creating work. Database-backed rate limiting exists on selected account, checkout, refund, and staff mutation paths. It is not a claim of webhook rate limiting, external firewall configuration, alerting, or structured production telemetry; those controls remain unimplemented launch blockers where applicable.

## Growth privacy, retention, and abuse response

Attribution cookies expire after 30 days. Anonymous referral and affiliate lookups rate-limit an HMAC-derived per-code scope; the limiter does not retain the raw code, raw IP address, a device fingerprint, or browser return URL. Only privacy-minimal aggregate or visit facts may be retained for this boundary. Financial, conversion, reward, commission, and payout ledgers follow the applicable order/accounting retention schedule. Redacted administrative audit history is append-only. The accountable owner must define and approve the production retention schedule before activation.

An abuse response may revoke a referral code, suspend an affiliate, and freeze new earning, redemption, or payout work. These controls do not erase the owner's existing history. Reversals must come only from verified order/payment/refund/shipment lifecycle facts; staff may not invent a corrective event. A payout executed outside the application must be recorded with its actual provider and external reference, never represented as application-executed proof.

These controls deliberately exclude document uploads, broad surveillance, device fingerprinting, raw-IP retention, routine manual customer approval, dual-admin publication, and per-action customer MFA.

## External limitations

Software cannot determine SKU legality, supply real catalog facts, configure tax/shipping, operate a warehouse, or guarantee payment-provider acceptance. Those external launch inputs require accountable owners. Their absence fails closed and is not evidence of an application defect or an invitation to fabricate a workflow record.

Production rewards, referral, affiliate, and payout activation remains disabled until real commerce data, payment-provider acceptance, destination policy, tax and shipping configuration, fulfillment operation, counsel-reviewed terms, approved unit economics, and an accountable payout operation are all supplied and verified.
