# ADR 0002: Individual Identity and Lightweight Authorization

**Status:** Accepted, revised for V1 lightweight commerce on 2026-08-24.

## Context

Checkout must exclude anonymous and blocked buyers while keeping ordinary research-use enrollment low-friction. Staff catalog, destination, refund, and fulfillment mutations remain sensitive.

## Decision

Use Clerk for authentication, verified email, session security, and MFA. Convert Clerk identity to a minimal server principal, then load buyer status, attestation, and staff capability from Neon.

Clerk email verification plus age 21+, a structured research purpose, and acceptance of the current versioned research-use attestation automatically creates an `active` buyer. V1 users are individuals. An optional organization-name profile field grants no tenancy, membership, shared data, or capability.

Public users may browse active catalog, prices, promotions, and use an anonymous cart. Authenticated buyers may check out and access only their own account/orders. Staff routes, refunds, and fulfillment require matching application capability plus a current MFA-authenticated session. One such administrator may publish catalog, destination, promotion, and copy records with an audit event.

Explicit review is limited to buyer status `review` or destination result `review`, and a decision binds to an immutable exact buyer/cart/destination snapshot. `blocked`, missing, and unavailable facts deny.

## Consequences

- Ordinary qualified buyers do not wait on staff action.
- Authorization remains server-owned and resource-bound; browser claims do not grant access.
- Clerk lifecycle/webhook processing may synchronize identity facts but cannot grant staff capability or override buyer blocks.
- MFA protects staff mutation surfaces without burdening normal customer operations.
- The optional organization name cannot be used in authorization queries.

## Rejected for V1

- Shared organization tenancy and membership administration: unnecessary for individual checkout.
- A custom identity provider: greater security and lifecycle burden.
- Browser-only roles or middleware-only authorization: insufficient for server mutations and resource ownership.
- Routine manual enrollment and recurring sensitive-action ceremonies: disproportionate to the selected lightweight model.
