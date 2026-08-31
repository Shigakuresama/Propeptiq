# ADR 0003: Managed Neon Auth for Customer Identity

**Status:** Superseded on 2026-08-30 by ADR 0004. Retained as the historical Managed Neon Auth decision and failed-revocation evidence.

## Context

At the 2026-08-30 integration checkpoint, a read-only audit found branchable
Managed Better Auth on the connected Neon project and a branch-specific Auth URL
from the Vercel integration. That evidence records the checkpoint; it is not an
ongoing claim that any deployment has Auth activated. The application still used
a disabled Clerk adapter and had no Clerk credentials, so customer account
creation rendered an unavailable state even though the audited external Auth
resource existed.

The same checkpoint found no configured `revokeSessionsOnPasswordReset` value
in the branch Auth record. A disposable-branch lifecycle test then created three
sessions, changed the synthetic user's password, and consumed the reset token,
but all three sessions remained valid. Adding the undocumented configuration key
directly on that branch was ignored. Password recovery therefore remains closed
by default in the application.

The application's authorization boundary is stricter than authentication alone: a buyer requires a provider-verified email, and staff actions require both persisted application capability and current, server-verifiable MFA evidence.

## Decision

Use the current, exactly pinned Managed Neon Auth Next.js SDK for customer signup, email OTP verification, sign-in, signed-cookie sessions, and sign-out. Continue loading buyer status, resource ownership, attestations, and capabilities from the application database.

The existing `users.clerk_id` column and `clerkUserId` application field remain as compatibility names for the external provider user ID in this change. They grant no Clerk-specific meaning or authority. A separately reviewed migration may rename them after all repository, journal, and integration contracts are updated.

Only a Neon session whose user email is provider-verified may project a verified application identity. The current Neon session contract does not expose the evidence required by this application for staff MFA. Neon-backed staff and target-identity operations therefore fail closed; this provider migration does not weaken the MFA requirement.

Normal Production signup, verification, sign-in, and sign-out are permitted only
after all of these gates have recorded evidence:

- independently generated, stable `NEON_AUTH_COOKIE_SECRET` and
  `RATE_LIMIT_SECRET` values, kept separate and supplied through the deployment
  secret store;
- production-capable custom SMTP configured for Managed Neon Auth with a
  verified sender;
- provider-required email verification;
- exact Preview and Production origins on the trusted-domain list, with
  localhost disabled for Production; and
- a branch-isolated Preview lifecycle test covering signup, email verification,
  sign-in, protected-route return, and sign-out without any Production identity
  or data write.

Password recovery is a separate capability. It remains unavailable until provider
configuration is proven to revoke every existing session after reset and a
two-session branch test proves the reset token is single-use and both old sessions
are rejected. Server identity reads always bypass signed session-data cache;
middleware cache reuse is limited to one second, the SDK's shortest supported
positive TTL.

## Consequences

- When the adapter and database are both enabled, a provider-verified session
  may project its external user ID into the application `users` table. Signup
  alone creates only the provider identity; buyer activation still requires the
  separately validated age, purpose, and attestation transaction.
- Customers can use one branch-aware identity system backed by the same Neon
  project as application data after the activation gates are satisfied.
- Preview branches can test users, verification tokens, sessions, and application data without mutating production.
- Unverified users may authenticate with Neon but cannot become application buyers or access private owner records.
- Staff access remains unavailable through Managed Neon Auth until current-session MFA evidence has an explicit, tested projection.
- The compatibility-named external-ID column is technical debt and must not be interpreted as evidence that Clerk remains the active provider.
- Shared Neon email delivery is acceptable only for isolated development or preview testing; it is not a production launch configuration.
- `AUTH_EMAIL_DELIVERY_VERIFIED=verified` is an operator assertion that gates
  live Auth after custom SMTP and the normal lifecycle are evidenced; it is not
  evidence by itself.
- `AUTH_PASSWORD_RESET_SESSION_REVOCATION=verified` is an operator assertion,
  not proof by itself; it gates recovery only, and retained provider configuration
  plus the two-session lifecycle evidence are both required before setting it.

## Rejected

- Enabling `AUTH_MODE` against the old Clerk adapter without Clerk credentials: it fails configuration and cannot create accounts.
- Treating any authenticated email as verified: it weakens the buyer gate and permits unverified identities.
- Inferring staff MFA from a successful Neon login: the current server session contract does not prove a current second factor.
- Renaming the external-ID column in the same change: it expands a provider bridge into a high-risk schema and journal migration.
