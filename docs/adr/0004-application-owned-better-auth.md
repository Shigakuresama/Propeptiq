# ADR 0004: Application-Owned Better Auth with Neon PostgreSQL

**Status:** Accepted for application integration on 2026-08-30; Preview and Production cutover remain gated.

## Context

Neon remains the application's PostgreSQL provider. Its branchable Managed Neon
Auth resource stores Better Auth 1.6-compatible users, credentials, sessions, and
verification records in the branch-local `neon_auth` schema. The managed runtime
did not expose a supported reset-time session-revocation setting, and a
disposable-branch test showed that old sessions survived a password reset.

The application needs email/password enrollment, email OTP verification,
database-validated sessions, Resend delivery, and password recovery that
invalidates every session issued before the reset. Authentication still does not
grant buyer status, record ownership, or staff authority by itself.

## Decision

Run an exactly pinned `better-auth@1.6.23` instance inside the Next.js
application and connect it directly to the existing `neon_auth` schema through a
small application-side PostgreSQL pool whose `search_path` is `neon_auth`. The
underlying Neon URL must be direct, not a `-pooler` URL: Neon's transaction-mode
PgBouncer rejects the startup option and cannot preserve this session setting.
Ambiguous PostgreSQL TLS modes are normalized to `verify-full` so a future
driver upgrade cannot silently weaken certificate and hostname verification.
Keep Neon as the database; replace only the managed Auth runtime and SDK.

Use the same-origin `/api/auth/*` boundary, the Better Auth `nextCookies` plugin,
required email verification, hashed six-digit OTPs, a disabled session-cookie
cache, and `revokeSessionsOnPasswordReset: true`. Resend sends verification and
reset messages. Better Auth and server-action request limits use the dedicated
atomic `propeptiq_auth.rate_limit_windows` store with HMAC-derived scopes. The
small idempotent support migration is independent of both provider-owned
`neon_auth` objects and the source-only commerce migration history. Each atomic
increment also prunes a bounded batch of expired windows so the table does not
depend on a process-local timer or an unimplemented scheduler.

Keep `users.clerk_id` and the `clerkUserId` application field as compatibility
names for the external Better Auth user ID. They do not grant Clerk-specific
meaning. Buyer facts and staff capabilities remain application-database facts.
Ordinary Better Auth sessions expose no server-verifiable second-factor ceremony,
so staff authorization continues to fail closed.

Keep Managed Neon Auth variables only for a bounded rollback window. Do not
change, copy, export, or rehash existing credential rows during cutover.

## Compatibility and recovery evidence

On 2026-08-30, an isolated disposable Neon branch proved both of these paths:

- signup, OTP verification, two independent sessions, one reset, immediate
  rejection of both old sessions, rejection of reset-token reuse, rejection of
  the old password, acceptance of the new password, and synthetic-row cleanup;
- a synthetic credential created by that branch's Managed Neon endpoint signed
  in through the application-owned runtime with the same user ID and unchanged
  credential hash, followed by synthetic-row cleanup.

This is branch evidence for the code and schema contract. It is not evidence that
Preview or Production environment variables, Resend delivery, domains, or
deployments have been cut over.

## Version boundary

Do not upgrade the populated schema to Better Auth 1.7 as part of this runtime
cutover. The current 1.6 `account` rows have no required `issuer` identity field.
A 1.7 upgrade requires the official read-only migration plan, a restored-backup
rehearsal, stopped Auth writers, a reviewed provider-ID identity strategy, the
guided data/schema migration, and post-migration sign-in and recovery checks.

## Consequences

- The application owns Auth configuration, cookies, delivery hooks, limits, and
  reset semantics while Neon continues to own PostgreSQL hosting and branching.
- Existing user IDs and password hashes remain in place; no account migration is
  required for the pinned 1.6 runtime cutover.
- Existing Managed Neon browser cookies are not portable to the application-owned
  cookie prefix and secret. Existing customers may need to sign in once after
  cutover; this does not recreate or alter their account credentials.
- `BETTER_AUTH_SECRET`, `RATE_LIMIT_SECRET`, database credentials, Resend
  credentials, and `APP_ORIGIN` are deployment secrets/configuration and must be
  stable and separately scoped per environment.
- The Auth runtime database URL must be a direct Neon connection. A pooled URL
  fails closed during Auth construction rather than failing on a customer
  request.
- Password recovery stays behind
  `AUTH_PASSWORD_RESET_SESSION_REVOCATION=verified` until the exact Preview
  deployment repeats the two-session proof. The flag records operator evidence;
  it does not create the property.
- Production account creation remains behind
  `AUTH_EMAIL_DELIVERY_VERIFIED=verified` and the existing deployment gates.

## Rejected

- Moving the database to Supabase solely to obtain Auth: it adds a database and
  migration change without solving an application requirement that Better Auth
  can satisfy against the existing Neon data.
- Recreating users or passwords in a new schema: it risks account loss and is
  unnecessary for the compatible 1.6 runtime.
- Enabling recovery based only on configuration: reset revocation requires a
  real multi-session lifecycle test on the deployment target.
- Treating successful login as staff MFA: no current second-factor evidence is
  projected by this configuration.
- Reusing the commerce `public.rate_limit_windows` table: the live-shaped Neon
  branch did not contain that source-only schema, so Auth would fail before
  handling a request. Applying the entire commerce history solely for Auth would
  cross an unrelated, unrehearsed migration boundary.
