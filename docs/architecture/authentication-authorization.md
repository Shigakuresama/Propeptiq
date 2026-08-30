# Authentication and Authorization

## Identity and buyer profile

Managed Neon Auth verifies the user's email and provides the stable external user identifier. The application database owns buyer status, age confirmation, structured purpose, attestation acceptance, staff capabilities, and resource authorization.

```ts
type BuyerStatus = "active" | "review" | "blocked";
type ResearchPurpose =
  | "in_vitro"
  | "analytical"
  | "educational"
  | "other_laboratory";
```

A provider-verified email plus age 21+, a purpose, and the current versioned research-use attestation automatically creates an `active` buyer. No organization or identity document, free-text application, or routine staff action is required.

Email/password enrollment uses provider-issued email-verification OTPs. Password
recovery uses the provider's single-use reset token and an application-owned
callback derived only from `APP_ORIGIN`; the public request response is identical
for known and unknown addresses. Sign-in, signup, OTP completion, and password
reset carry only an allowlisted private application return path. External,
protocol-relative, public, malformed, or whitespace-bearing destinations fail
closed to `/checkout`. A successful password reset returns to sign-in rather
than treating the reset token as an authenticated application session. Recovery
remains unavailable unless provider configuration and a branch-isolated test
prove that reset tokens are single-use and every session issued before the reset
is rejected afterward.

V1 principals are individual Managed Neon Auth users. `organizationName` is optional descriptive profile text. It does not establish tenancy, membership, inherited capability, data scope, or a shared order owner.

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

Verify Managed Neon Auth sessions server-side, bind resource access to the server principal, deny on missing or inconsistent identity state, protect staff routes with MFA and capability checks, rate-limit mutations, redact logs, and audit status/publication/refund/fulfillment changes. The signed session cache is bypassed immediately after OTP verification so private access is based on a fresh provider read. Managed Neon Auth customer sessions do not currently supply the application-verifiable MFA evidence required for staff authority, so staff access remains denied in that adapter until an explicit MFA projection is implemented and verified. A browser-supplied user, role, status, price, resource owner, reset token, or return URL is never authoritative.

## Referral and affiliate attribution

Public referral and affiliate codes are opaque lookup keys, not authorization credentials. A valid active code may create a signed, environment-bound, first-party attribution cookie for at most 30 days. The cookie carries only the canonical attribution facts needed later; tampered, expired, future-dated, malformed, or wrong-environment values fail closed. Browser-supplied account identity, program status, terms hash, prices, reward value, commission value, payout facts, and return URLs are never authoritative.

Anonymous code lookup uses a privacy-minimal HMAC-derived per-caller rate-limit scope based on Vercel's platform-provided client address. It does not retain the raw address, raw code, or a device fingerprint, and a missing platform address fails closed outside local development. Referral activation and affiliate application require the authenticated server principal and the exact current server-loaded terms version and server-computed SHA-256 content hash. Self-referral and duplicate referred-account facts deny transactionally.

Customers retain a lightweight flow: no document upload, routine staff approval, customer MFA, or device fingerprinting is required. A blocked or suspended growth status prevents new value creation while preserving authenticated owner reads of existing history.
