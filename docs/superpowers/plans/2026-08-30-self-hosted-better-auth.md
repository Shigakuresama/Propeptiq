# Self-Hosted Better Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Managed Neon Auth runtime with application-owned Better Auth 1.6.23 while retaining Neon PostgreSQL, existing identity records, verified-email buyer projection, fail-closed staff authorization, and guaranteed reset-time revocation of every session.

**Architecture:** The Next.js application mounts Better Auth at the existing `/api/auth/*` boundary and connects it directly to the branch-local `neon_auth` schema through a narrowly configured PostgreSQL pool. The first cutover pins the same Better Auth 1.6.23 release used by the installed Managed Neon Auth SDK, preserving the current schema, user IDs, and credential hashes while Better Auth configuration, cookies, recovery semantics, OTP delivery, and trusted origins move into reviewed application code. Better Auth 1.7 is a separate, rehearsed schema migration because its required account identity fields are absent from the current managed schema; it must not be mixed into this zero-copy runtime cutover. Resend sends auth emails, password recovery remains gated until a disposable-branch lifecycle proves old-session rejection, and no Production database or identity write occurs during implementation.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, Better Auth 1.6.23, PostgreSQL/Neon, node-postgres 8.23, Resend 6.22.1, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1.

**Spec:** `docs/architecture/authentication-authorization.md` and the accepted 2026-08-30 user decision to keep Neon PostgreSQL while moving the authentication runtime into the application.

## Global Constraints

- Preserve all existing external user IDs and credential hashes in `neon_auth`; do not copy, rewrite, log, or export passwords or tokens.
- Do not use Production users, sessions, reset tokens, email addresses, or database writes during implementation or lifecycle testing.
- Set `emailAndPassword.requireEmailVerification` and `emailAndPassword.revokeSessionsOnPasswordReset` to `true` in the application-owned Better Auth configuration.
- Keep Better Auth session cookie caching disabled so revocation is observed on the next server validation.
- Keep staff authorization fail-closed until a separately tested Better Auth second-factor projection exists; ordinary sign-in never implies MFA.
- Keep public auth errors enumeration-neutral and keep protected return destinations constrained by `src/auth/routes.ts`.
- Keep `AUTH_PASSWORD_RESET_SESSION_REVOCATION=verified` as an operator evidence gate until the real two-session disposable-branch test passes.
- Use the existing `neon_auth` schema through PostgreSQL `search_path` over a direct Neon connection; reject `-pooler` URLs because transaction-mode PgBouncer cannot preserve that connection state. Do not run Better Auth migrations against Production and do not alter Neon-managed schema objects in this change.
- Keep Better Auth 1.6.23 pinned for this compatibility cutover. Do not upgrade to 1.7 until the official read-only migration plan, restored-backup rehearsal, writer shutdown, and guided account-identity migration have been separately reviewed.
- Back Better Auth's request limiter with the Auth-only atomic `propeptiq_auth.rate_limit_windows` store through `customStorage.consume`; do not use process-local memory on Vercel, do not add a table to provider-owned `neon_auth`, and do not require the unrelated commerce migration history for Auth activation.
- Store no secrets in the repository, test output, plan, pull request, or browser evidence.
- Keep the dirty primary checkout and unrelated worktrees untouched.

---

### Task 1: Dependency and Environment Contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/config/env-schema.ts`
- Test: `src/env.test.ts`

**Interfaces:**
- Consumes: existing `AUTH_MODE`, `DATABASE_MODE`, `EMAIL_MODE`, `APP_ORIGIN`, `DATABASE_URL`, `TEST_DATABASE_URL`, `RESEND_API_KEY`, and `RESEND_FROM` environment contracts.
- Produces: `ServerEnv.BETTER_AUTH_SECRET` and an enabled-auth invariant that requires the matching database/email adapters without any Managed Neon Auth URL.

- [ ] **Step 1: Write failing environment tests**

Add literal fixtures that prove enabled application-owned auth accepts `BETTER_AUTH_SECRET` with a matching database and Resend configuration, rejects a missing or repeated secret, rejects `AUTH_MODE=test` unless `DATABASE_MODE=test`, and no longer requires `STORAGE_NEON_AUTH_BASE_URL`, `NEON_AUTH_BASE_URL`, or `NEON_AUTH_COOKIE_SECRET`.

```ts
expect(() => parseServerEnv({
  ...testEnvironment,
  AUTH_MODE: "test",
  DATABASE_MODE: "test",
  EMAIL_MODE: "test",
  BETTER_AUTH_SECRET: generatedSecret,
})).not.toThrow();
```

- [ ] **Step 2: Run the environment tests and verify RED**

Run: `npx vitest run src/env.test.ts --testTimeout=20000`

Expected: failure because `BETTER_AUTH_SECRET` is not accepted and enabled Auth still requires Managed Neon Auth configuration.

- [ ] **Step 3: Replace the managed SDK dependency**

Run:

```text
npm uninstall @neondatabase/auth
npm install --save-exact better-auth@1.6.23
```

Confirm `npm ls better-auth --all` reports one valid 1.6.23 root dependency. Record Better Auth 1.7 as a schema-migration follow-up rather than silently changing the populated account contract.

- [ ] **Step 4: Implement the environment contract**

Add `BETTER_AUTH_SECRET` using the existing generated-secret validator. When `AUTH_MODE` is enabled, require `APP_ORIGIN`, `BETTER_AUTH_SECRET`, matching non-disabled `DATABASE_MODE`, matching non-disabled `EMAIL_MODE`, and existing database/Resend credentials. Reject `BETTER_AUTH_SECRET === RATE_LIMIT_SECRET`. Retain the Managed Neon variables only as optional rollback inputs for one release and remove them from all runtime requirements.

- [ ] **Step 5: Run the environment tests and verify GREEN**

Run: `npx vitest run src/env.test.ts --testTimeout=20000`

Expected: all environment tests pass.

- [ ] **Step 6: Commit the dependency and environment boundary**

```text
git add package.json package-lock.json .env.example src/config/env-schema.ts src/env.test.ts
git commit -m "build(auth): adopt Better Auth runtime"
```

### Task 2: Auth Email Delivery and Better Auth Factory

**Files:**
- Create: `src/auth/better-auth-email.ts`
- Create: `src/auth/better-auth-email.test.ts`
- Create: `src/auth/better-auth-server.ts`
- Create: `src/auth/better-auth-server.test.ts`
- Modify: `src/db/repositories/rate-limit-store.ts`
- Test: `src/db/repositories/rate-limit-store.test.ts`
- Delete: `src/auth/neon-server.ts`
- Delete: `src/auth/neon-server.test.ts`

**Interfaces:**
- Consumes: `ServerEnv`, `pg.Pool`, Resend, Better Auth `emailOTP`, and `nextCookies`.
- Produces: `getBetterAuthForEnvironment(environment): Auth | null`, `getBetterAuth(): Auth | null`, and a test-injectable `createBetterAuthForEnvironment(environment, dependencies)` factory.

- [ ] **Step 1: Write failing email and factory tests**

Name the protected failures explicitly: reset messages must contain only the provider-generated HTTPS reset URL; verification messages must contain the numeric OTP and its expiry; disabled/local-driver environments must not create a PostgreSQL pool; enabled environments must expose a handler configured for the `neon_auth` schema.

```ts
expect(message).toMatchObject({
  subject: "Reset your PROPEPTIQ password",
  to: "buyer@example.test",
});
expect(message.text).toContain("https://propeptiq.com/api/auth/reset-password/");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/auth/better-auth-email.test.ts src/auth/better-auth-server.test.ts --testTimeout=20000`

Expected: module-not-found failures for the new application-owned runtime.

- [ ] **Step 3: Implement Resend auth messages**

Create pure builders for verification and reset messages, then a Resend dispatcher that uses only `RESEND_FROM` and `RESEND_API_KEY`. Escape all dynamic HTML, include equivalent text content, never include passwords or full session data, and surface delivery failures to server logs only as redacted error categories.

- [ ] **Step 4: Implement the Better Auth factory**

Construct a cached PostgreSQL pool with `options: "-c search_path=neon_auth"`, `max: 5`, finite connection/idle timeouts, and the environment-selected direct Neon database URL. Reject a `-pooler` URL before pool creation. Configure Better Auth with this exact security contract:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  revokeSessionsOnPasswordReset: true,
  sendResetPassword,
},
advanced: {
  cookiePrefix: "propeptiq",
  database: { generateId: "uuid" },
},
plugins: [emailOTP({ storeOTP: "hashed", allowedAttempts: 3 }), nextCookies()],
```

Set `appName`, `baseURL`, `secret`, `trustedOrigins`, explicit secure cookie behavior for Preview/Production, and no session cookie cache. Implement Better Auth's custom rate-limit storage with atomic `consume`: HMAC the provider key using `RATE_LIMIT_SECRET`, store counters only in `propeptiq_auth.rate_limit_windows`, return seconds until the fixed window expires, and provide compatibility `get`/`set` methods that are never used while `consume` is present. Configure only Vercel's trusted single-value client-IP header in deployed environments. Keep `nextCookies()` last.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run src/auth/better-auth-email.test.ts src/auth/better-auth-server.test.ts --testTimeout=20000`

Expected: all new tests pass without opening a real database connection.

- [ ] **Step 6: Commit the application-owned runtime**

```text
git add src/auth/better-auth-email.ts src/auth/better-auth-email.test.ts src/auth/better-auth-server.ts src/auth/better-auth-server.test.ts src/auth/neon-server.ts src/auth/neon-server.test.ts
git commit -m "feat(auth): configure self-hosted Better Auth"
```

### Task 3: API Route and Protected-Route Proxy

**Files:**
- Modify: `src/app/api/auth/[...path]/route.ts`
- Test: `src/app/api/auth/[...path]/route.test.ts`
- Modify: `proxy.ts`
- Test: `src/auth/proxy.test.ts`

**Interfaces:**
- Consumes: `getBetterAuthForEnvironment`, Better Auth `handler`, and `auth.api.getSession`.
- Produces: same-origin `/api/auth/*` GET/POST handling and database-validated redirects for private routes.

- [ ] **Step 1: Rewrite route and proxy tests first**

Assert that disabled auth returns the existing no-store 404, enabled GET/POST calls the real app-owned handler, unverified recovery gates still return 404, and an absent/invalid database session redirects to the allowlisted sign-in route with an encoded private return destination.

- [ ] **Step 2: Run the route/proxy tests and verify RED**

Run: `npx vitest run src/app/api/auth/[...path]/route.test.ts src/auth/proxy.test.ts --testTimeout=20000`

Expected: failures because the route and proxy still import `neon-server`.

- [ ] **Step 3: Replace API forwarding and middleware**

Mount the Better Auth standard `Request -> Response` handler for GET and POST. Preserve the password-recovery endpoint classifier and gate. In `proxy.ts`, pass `request.headers` to `auth.api.getSession`; redirect only when no validated user exists. Never treat cookie presence alone as authorization.

- [ ] **Step 4: Run the route/proxy tests and verify GREEN**

Run: `npx vitest run src/app/api/auth/[...path]/route.test.ts src/auth/proxy.test.ts --testTimeout=20000`

Expected: all route and proxy tests pass.

- [ ] **Step 5: Commit routing changes**

```text
git add src/app/api/auth/[...path]/route.ts src/app/api/auth/[...path]/route.test.ts proxy.ts src/auth/proxy.test.ts
git commit -m "feat(auth): serve Better Auth from the application"
```

### Task 4: Customer Auth Actions and Recovery

**Files:**
- Modify: `src/auth/actions.ts`
- Test: `src/auth/actions.test.ts`
- Modify: `src/components/account/managed-auth-form.tsx`
- Test: `src/components/account/managed-auth-form.test.tsx`
- Modify: `src/components/account/managed-password-recovery.tsx`
- Test: `src/components/account/managed-password-recovery.test.tsx`

**Interfaces:**
- Consumes: Better Auth server methods `signUpEmail`, `signInEmail`, `sendVerificationOTP`, `verifyEmailOTP`, `signOut`, `requestPasswordReset`, and `resetPassword`.
- Produces: the existing `ManagedAuthActionState` user contract with enumeration-neutral errors and stable return destinations.

- [ ] **Step 1: Update action tests for Better Auth’s server API**

Keep each behavioral expectation independent of mocks: valid signup returns a verification state, verified sign-in redirects, unverified sign-in requests an OTP without revealing account existence, OTP verification establishes a fresh session, sign-out clears the session, reset requests remain neutral, reset consumes one token, and a successful reset redirects to sign-in.

- [ ] **Step 2: Run action/component tests and verify RED**

Run: `npx vitest run src/auth/actions.test.ts src/components/account/managed-auth-form.test.tsx src/components/account/managed-password-recovery.test.tsx --testTimeout=20000`

Expected: failures because action code still expects the Managed Neon SDK `{ data, error }` response shape.

- [ ] **Step 3: Migrate the server actions**

Call Better Auth `auth.api` methods with explicit `body` payloads and current request headers where required. Classify only Better Auth’s documented unverified-email code; collapse every other public error to the existing neutral messages. Keep Zod validation, token validation, return-destination allowlisting, and the operator recovery gate unchanged.

- [ ] **Step 4: Align forms without changing visible semantics**

Retain accessible form labels, verification-code entry, recovery links, and status announcements. Remove only provider-specific naming from internal component props and comments.

- [ ] **Step 5: Run action/component tests and verify GREEN**

Run: `npx vitest run src/auth/actions.test.ts src/components/account/managed-auth-form.test.tsx src/components/account/managed-password-recovery.test.tsx --testTimeout=20000`

Expected: all focused tests pass.

- [ ] **Step 6: Commit customer flows**

```text
git add src/auth/actions.ts src/auth/actions.test.ts src/components/account/managed-auth-form.tsx src/components/account/managed-auth-form.test.tsx src/components/account/managed-password-recovery.tsx src/components/account/managed-password-recovery.test.tsx
git commit -m "feat(auth): migrate customer identity flows"
```

### Task 5: Identity Projection and Authorization Boundaries

**Files:**
- Modify: `src/auth/identity.ts`
- Test: `src/auth/identity.test.ts`
- Modify: `src/auth/server.ts`
- Test: `src/auth/server.test.ts`
- Test: `src/auth/server-affiliate-admin.test.ts`
- Modify: `src/auth/runtime-provider.tsx`

**Interfaces:**
- Consumes: Better Auth `auth.api.getSession({ headers })` and its `user.id`, `user.email`, and `user.emailVerified` fields.
- Produces: the unchanged `VerifiedIdentity` and `Principal` contracts used by account, checkout, order, referral, rewards, and admin code.

- [ ] **Step 1: Write Better Auth identity tests first**

Prove that verified Better Auth users project to the existing compatibility `clerkUserId`, unverified users never become verified buyers, missing sessions resolve to null, and ordinary Better Auth login continues to project both MFA flags as false.

- [ ] **Step 2: Run identity/server tests and verify RED**

Run: `npx vitest run src/auth/identity.test.ts src/auth/server.test.ts src/auth/server-affiliate-admin.test.ts --testTimeout=20000`

Expected: failures because identity loading still calls `getNeonAuthForEnvironment` and `projectNeonIdentity`.

- [ ] **Step 3: Replace the provider projection**

Rename the provider projection to `projectBetterAuthIdentity`, validate the current request headers through the app-owned auth instance, and preserve the compatibility ID field so existing application rows remain linked. Keep target-identity staff operations returning null until a current second-factor ceremony is explicitly modeled.

- [ ] **Step 4: Run identity/server tests and verify GREEN**

Run: `npx vitest run src/auth/identity.test.ts src/auth/server.test.ts src/auth/server-affiliate-admin.test.ts --testTimeout=20000`

Expected: all identity and authorization-boundary tests pass.

- [ ] **Step 5: Commit identity changes**

```text
git add src/auth/identity.ts src/auth/identity.test.ts src/auth/server.ts src/auth/server.test.ts src/auth/server-affiliate-admin.test.ts src/auth/runtime-provider.tsx
git commit -m "refactor(auth): project Better Auth identities"
```

### Task 6: Real Disposable-Branch Lifecycle Verification

**Files:**
- Create: `src/auth/better-auth-postgres.integration.test.ts`
- Modify: `vitest.integration.config.ts`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: exact direct `TEST_DATABASE_URL`, `TEST_DATABASE_CONFIRMATION=isolated-test-database`, a branch-local `neon_auth` schema, and a test-only in-memory auth email sink.
- Produces: reproducible evidence that existing Better Auth credentials remain compatible and password reset invalidates every old session.

- [ ] **Step 1: Write the guarded lifecycle test**

The test must refuse to connect unless both guards are present and the URL does not appear Production-scoped. Using a unique `@example.test` user, exercise the real Better Auth handler with independent cookie jars: signup, OTP verification, two sign-ins, reset request, token consumption, rejection of both old sessions, successful new-password sign-in, reset-token reuse rejection, and deletion of the synthetic user’s rows.

- [ ] **Step 2: Run without guards and verify safe refusal**

Run: `npx vitest run --config vitest.integration.config.ts src/auth/better-auth-postgres.integration.test.ts`

Expected: the test reports not run without opening a database connection.

- [ ] **Step 3: Run against the disposable Neon branch**

Inject the disposable branch URL into the process without writing it to disk, set the exact test confirmation, and run the same command. Do not print the URL.

Expected: one synthetic lifecycle passes; both pre-reset sessions return no user immediately after reset; reset-token reuse fails; cleanup leaves no matching user/account/session/verification rows.

- [ ] **Step 4: Verify managed-account compatibility**

Create one synthetic credential through the branch’s Managed Neon endpoint, mark only that synthetic email verified in the disposable database, then sign in through the application-owned Better Auth handler. Delete the synthetic records after the assertion.

Expected: sign-in succeeds without rewriting the credential hash or user ID.

- [ ] **Step 5: Commit integration evidence**

```text
git add src/auth/better-auth-postgres.integration.test.ts vitest.integration.config.ts docs/testing.md
git commit -m "test(auth): prove Better Auth lifecycle on Neon"
```

### Task 7: Documentation, Full Verification, and Cutover Readiness

**Files:**
- Modify: `README.md`
- Supersede: `docs/adr/0003-managed-neon-auth.md`
- Modify: `docs/architecture/authentication-authorization.md`
- Modify: `docs/architecture/system-architecture.md`
- Modify: `docs/deployment/environments-and-recovery.md`
- Modify: `docs/security/threat-model.md`
- Modify: `docs/product-requirements.md`
- Modify: `docs/sources.md`

**Interfaces:**
- Consumes: all verified behavior and disposable-branch evidence from Tasks 1–6.
- Produces: exact operator requirements for Preview and Production without claiming that configuration or deployment has occurred.

- [ ] **Step 1: Update architecture and deployment documentation**

Record that Neon remains PostgreSQL, the application owns the schema-compatible Better Auth 1.6.23 runtime, `neon_auth` remains the branch-local persistence schema, Resend is the email provider, reset-time session revocation is code-enforced, and staff MFA remains closed. Document the rollback boundary: restore the previous deployment and Managed Neon environment variables; do not mutate identity rows. Add an explicit Better Auth 1.7 follow-up gate covering the official migration plan, restorable backup rehearsal, writer shutdown, account `issuer` migration, and all-instance cutover.

- [ ] **Step 2: Run focused auth verification**

Run:

```text
npx vitest run src/auth src/app/api/auth src/components/account --testTimeout=20000
npm run typecheck
npm run lint
```

Expected: zero failures, zero type errors, and zero lint warnings.

- [ ] **Step 3: Run the complete release gate**

Run:

```text
npm run verify
npm run audit:prod
npm run verify:workspace-boundary
git diff --check
```

Expected: all commands exit 0; the production dependency audit reports no known production vulnerability; the workspace boundary remains valid.

- [ ] **Step 4: Review the exact branch diff**

Inspect `git diff origin/main...HEAD`, confirm no secret values, managed endpoint URLs, synthetic credentials, production identity data, or unrelated UI/catalog/commerce changes are present, and verify every Global Constraint maps to code or retained documentation.

- [ ] **Step 5: Record the Production cutover sequence**

The reviewed release order is: add a generated `BETTER_AUTH_SECRET`; retain the current Neon/Resend/database variables; deploy Preview; run signup/OTP/two-session reset/sign-out tests on Preview; set `AUTH_PASSWORD_RESET_SESSION_REVOCATION=verified` only after evidence; deploy Production; verify account creation and recovery with a designated owner-controlled account; then disable Managed Neon signup while retaining its resource for rollback. No production step is performed without a fresh read-back.

- [ ] **Step 6: Commit documentation and verification notes**

```text
git add README.md docs/adr/0003-managed-neon-auth.md docs/architecture/authentication-authorization.md docs/architecture/system-architecture.md docs/deployment/environments-and-recovery.md docs/security/threat-model.md docs/product-requirements.md docs/sources.md
git commit -m "docs(auth): document Better Auth ownership and cutover"
```
