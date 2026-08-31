# Authentication and Authorization

## Identity and buyer profile

Application-owned Better Auth verifies the user's email and provides the stable
external user identifier. Better Auth persists its identity records in Neon's
branch-local `neon_auth` schema; the application database owns buyer status, age
confirmation, structured purpose, attestation acceptance, staff capabilities,
and resource authorization.

The application sets `search_path=neon_auth` when it opens the Better Auth
PostgreSQL pool. That connection must use Neon's direct hostname, not its
transaction-mode `-pooler` hostname, because the search path is connection
state. Configuration rejects a pooled Neon URL before constructing Auth and
pins ambiguous PostgreSQL TLS modes to `verify-full`.

Authentication request and server-action abuse limits use HMAC-derived scopes
in the independently migrated `propeptiq_auth.rate_limit_windows` table. Raw IP
addresses and provider keys are not stored. Auth activation fails closed until
that support schema exists and the runtime database role can update it.

```ts
type BuyerStatus = "active" | "review" | "blocked";
type ResearchPurpose =
  | "in_vitro"
  | "analytical"
  | "educational"
  | "other_laboratory";
```

A provider-verified email plus age 21+, a purpose, and the current versioned research-use attestation automatically creates an `active` buyer. No organization or identity document, free-text application, or routine staff action is required.

Email/password enrollment uses Better Auth email-verification OTPs delivered by
Resend. Password recovery uses Better Auth's single-use reset token and an application-owned
callback derived only from `APP_ORIGIN`; the public request response is identical
for known and unknown addresses. Sign-in, signup, OTP completion, and password
reset carry only an allowlisted private application return path. External,
protocol-relative, public, malformed, or whitespace-bearing destinations fail
closed to `/checkout`. A successful password reset returns to sign-in rather
than treating the reset token as an authenticated application session. Recovery
remains unavailable unless the deployed Better Auth configuration and a branch-isolated test
prove that reset tokens are single-use and every session issued before the reset
is rejected afterward.

The compatible runtime takeover preserves user IDs and password hashes but does
not preserve the Managed Neon browser cookie. A customer who was already signed
in may need to sign in once after cutover.

V1 principals are individual Better Auth users. `organizationName` is optional descriptive profile text. It does not establish tenancy, membership, inherited capability, data scope, or a shared order owner.

## Authorization

- Public: active catalog, prices, promotions, quality records intended for public display, research-use policy, and anonymous cart.
- Authenticated buyer: checkout, own orders, own account, and attestation updates.
- Staff: explicit application capability plus a current MFA session for staff routes.
- Refund and fulfillment mutations: matching capability plus current MFA.
- Publication: one authorized MFA-authenticated administrator may publish products, destination rules, promotions, and catalog copy; append an audit event.
- Growth administration: one authorized MFA-authenticated administrator with the exact capability may publish terms and policies, manage codes and affiliate status, make reward adjustments, create payout batches, and record externally executed payouts; every mutation is rate-limited and audited.

Ordinary buyer operations do not require MFA. Sensitive actions do not require an extra confirmation ceremony beyond the current MFA-authenticated staff session.

## Status and review

- `active`: may pass the account gate.
- `review`: denies ordinary checkout until an exact immutable buyer/cart/destination snapshot is approved.
- `blocked`: denies checkout and invalidates prior review decisions.

Review occurs only for `buyer.status === "review"` or an explicit destination rule equal to `review`. Any buyer, cart, attestation, or destination change invalidates the snapshot authorization.

## Security properties

Verify Better Auth sessions against PostgreSQL on the server, bind resource
access to the server principal, deny on missing or inconsistent identity state,
protect staff routes with MFA and capability checks, rate-limit mutations,
redact logs, and audit status/publication/refund/fulfillment changes. Session
cookie caching is disabled, so a revoked database session is rejected on the
next validation. The current Better Auth customer session does not supply the
application-verifiable MFA evidence required for staff authority, so staff
access remains denied until an explicit MFA projection is implemented and
verified. A browser-supplied user, role, status, price, resource owner, reset
token, or return URL is never authoritative.

## Referral and affiliate attribution

Public referral and affiliate codes are opaque lookup keys, not authorization credentials. A valid active code may create a signed, environment-bound, first-party attribution cookie for at most 30 days. The cookie carries only the canonical attribution facts needed later; tampered, expired, future-dated, malformed, or wrong-environment values fail closed. Browser-supplied account identity, program status, terms hash, prices, reward value, commission value, payout facts, and return URLs are never authoritative.

Anonymous code lookup uses a privacy-minimal HMAC-derived per-caller rate-limit scope based on Vercel's platform-provided client address. It does not retain the raw address, raw code, or a device fingerprint, and a missing platform address fails closed outside local development. Referral activation and affiliate application require the authenticated server principal and the exact current server-loaded terms version and server-computed SHA-256 content hash. Self-referral and duplicate referred-account facts deny transactionally.

Customers retain a lightweight flow: no document upload, routine staff approval, customer MFA, or device fingerprinting is required. A blocked or suspended growth status prevents new value creation while preserving authenticated owner reads of existing history.
