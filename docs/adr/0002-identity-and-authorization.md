# ADR 0002: Managed Identity and Central Authorization

- **Date:** 2026-08-24
- **Status:** Accepted for implementation; production configuration gated

## Context

No guest checkout is allowed. Buyers may act individually or through organizations. Staff actions are high impact and require MFA, least privilege, step-up, and immutable decision history.

## Decision

Use Clerk `@clerk/nextjs` 7.x for authentication and Organizations. Require MFA for all production accounts and recent strict-MFA reverification for sensitive actions. Convert Clerk identity into a minimal server principal, then load researcher approval, membership, suspension, staff capabilities, and resource scope from Neon.

All authorization is centralized in server-only `requirePrincipal`/`requireCapability` policies and principal-bound DAL functions. Clerk metadata/roles may help identity UX but do not independently grant business capability.

## Consequences

- Reduces custom credential/session security burden.
- Production Clerk plan/settings and organization enrollment controls are launch gates.
- Database and Clerk lifecycle synchronization needs webhooks/reconciliation.
- Requiring MFA for all users adds friction but avoids an admin-only enrollment gap and protects sensitive research-account data.

## Alternatives

- Custom auth: rejected due to security/maintenance risk.
- Auth.js: viable but would require more MFA/organization/admin lifecycle work.
- Clerk-only authorization: rejected because business approval/compliance is application data.

## Lifecycle synchronization

Signed Clerk webhooks feed a unique, retryable lifecycle inbox for user, organization, invitation, and membership changes. Processing never grants application approval or staff capability; it only projects identity/membership lifecycle facts and immediately removes effective access after a verified revocation. A scheduled read-only reconciliation compares Clerk identities/memberships with the Neon projection and opens exceptions without silently widening access. Until a new or inconsistent membership is reconciled and approved by application policy, authorization denies it.
