# Authentication and Authorization

## Identity and buyer profile

Clerk verifies the user's email and provides the stable external user identifier. The application database owns buyer status, age confirmation, structured purpose, attestation acceptance, staff capabilities, and resource authorization.

```ts
type BuyerStatus = "active" | "review" | "blocked";
type ResearchPurpose =
  | "in_vitro"
  | "analytical"
  | "educational"
  | "other_laboratory";
```

A Clerk-verified email plus age 21+, a purpose, and the current versioned research-use attestation automatically creates an `active` buyer. No organization or identity document, free-text application, or routine staff action is required.

V1 principals are individual Clerk users. `organizationName` is optional descriptive profile text. It does not establish tenancy, membership, inherited capability, data scope, or a shared order owner.

## Authorization

- Public: active catalog, prices, promotions, quality records intended for public display, research-use policy, and anonymous cart.
- Authenticated buyer: checkout, own orders, own account, and attestation updates.
- Staff: explicit application capability plus a current MFA session for staff routes.
- Refund and fulfillment mutations: matching capability plus current MFA.
- Publication: one authorized MFA-authenticated administrator may publish products, destination rules, promotions, and catalog copy; append an audit event.

Ordinary buyer operations do not require MFA. Sensitive actions do not require an extra confirmation ceremony beyond the current MFA-authenticated staff session.

## Status and review

- `active`: may pass the account gate.
- `review`: denies ordinary checkout until an exact immutable buyer/cart/destination snapshot is approved.
- `blocked`: denies checkout and invalidates prior review decisions.

Review occurs only for `buyer.status === "review"` or an explicit destination rule equal to `review`. Any buyer, cart, attestation, or destination change invalidates the snapshot authorization.

## Security properties

Verify Clerk tokens and webhook signatures server-side, bind resource access to the server principal, deny on missing or inconsistent identity state, protect staff routes with MFA and capability checks, rate-limit mutations, redact logs, and audit status/publication/refund/fulfillment changes. A browser-supplied user, role, status, price, or resource owner is never authoritative.
