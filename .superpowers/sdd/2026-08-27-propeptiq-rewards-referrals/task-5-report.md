# Task 5 — Referral attribution and shared research sets

## 5A checkpoint — Signed referral attribution and fixed landing route

### Outcome

Implemented Task 5A only. The server now issues and verifies a bounded V1
attribution envelope with exactly `schemaVersion`, program, opaque code,
issued time, and expiry. The payload is protected by SHA-256 HMAC framing that
includes the application environment and a domain separator. Verification uses
constant-time signature comparison after strict canonical base64url decoding.

The `/r/[code]` route accepts only bounded `ref_` customer-referral codes,
performs one bounded active-code/current-referral-policy lookup, sets the signed
cookie only for an eligible result, and always returns the same `303` redirect
to same-origin `/catalog`. Query-string return or redirect targets are ignored.
Invalid, inactive, nonexistent, unavailable, malformed, and repository-error
paths are non-enumerating and set no cookie.

No enrollment, binding, discount, lifecycle, shared-set, affiliate-resolution,
UI, schema, migration, external-service, or production-secret work was added.

### Changed implementation files

- `src/growth/attribution-cookie.ts`
- `src/growth/attribution-cookie.test.ts`
- `src/growth/referral-landing-runtime.ts`
- `src/growth/referral-landing-runtime.test.ts`
- `src/app/r/[code]/route.ts`
- `src/app/r/[code]/route.test.ts`

### RED evidence

The first attribution-cookie run was:

```text
npm test -- --run src/growth/attribution-cookie.test.ts
```

Exit 1: one suite failed collection with zero tests because
`src/growth/attribution-cookie.ts` did not exist.

The first route/runtime run was:

```text
npm test -- --run src/growth/referral-landing-runtime.test.ts src/app/r/[code]/route.test.ts
```

Exit 1: two suites failed collection with zero tests because the runtime and
route modules did not exist.

Exact-diff review then identified an out-of-scope affiliate lookup. A focused
regression RED produced 2 expected failures and 4 passes: an `aff_` code reached
runtime assembly and the lookup attempted to query it. The route and adapter
were narrowed to `ref_` customer-referral codes only; the reusable envelope
continues to validate the plan-defined customer-referral and affiliate program
values without implementing affiliate resolution.

### GREEN evidence

Final focused command:

```text
npm test -- --run src/growth/attribution-cookie.test.ts src/growth/referral-landing-runtime.test.ts src/app/r/[code]/route.test.ts
```

Exit 0: 3 files and 13/13 tests passed.

Final full unit command:

```text
npm test
```

Exit 0: 75 files and 818/818 tests passed.

### Security and privacy scenarios

- Exact own-key validation rejects sparse, extra-key, inherited, and
  prototype-bearing envelope inputs.
- Only `customer_referral` and `affiliate` are recognized by the reusable V1
  envelope; program-specific `ref_`/`aff_` opaque-code bounds are enforced.
- Malformed framing, invalid or non-canonical base64url, oversized values,
  truncated signatures, payload tampering, wrong environments, unknown
  programs, short secrets, invalid timestamps, future-issued values, expired
  values, zero-length windows, and windows over 30 days are rejected.
- The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, has `Max-Age` no greater
  than 30 days, and is `Secure` outside local development. The module is marked
  server-only.
- The envelope contains no email, Clerk ID, address, product/order/payment
  facts, IP, user agent, or device fingerprint.
- The landing lookup receives only the opaque code and authoritative server
  clock. Request headers, IP-like values, user agent, return targets, and other
  query data are not forwarded.
- Open-redirect tests prove attacker-controlled `return` and `redirect` values
  still produce only same-origin `/catalog`.
- Enumeration tests prove invalid, inactive/nonexistent, unavailable, malformed,
  and failed lookup outcomes all use the same redirect status/location and no
  cookie.

### Runtime and persistence boundaries

- The runtime injects the existing server-only `RATE_LIMIT_SECRET` only when it
  is at least 32 characters; HMAC framing domain-separates referral attribution
  and binds the signature to `local`, `preview`, or `production`.
- Missing or invalid secret configuration and disabled database mode return no
  runtime. Connection/query failures are collapsed by the route to the same
  no-cookie redirect.
- The PostgreSQL adapter executes one parameterized query with `LIMIT 2` and
  requires exactly one active customer code plus exactly one current active
  30-day referral policy. Zero, duplicate, or malformed rows fail closed.
- No visit was appended. The brief makes visits optional, and the existing
  schema/repository has no privacy-minimal visit API. No event semantics or
  storage were invented and no schema change was made.

### Validation gates

- Focused cookie/runtime/route tests: exit 0, 3 files, 13/13 tests.
- Full unit suite: exit 0, 75 files, 818/818 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- `git diff --check` and staged diff check: exit 0; only expected Windows
  LF/CRLF working-copy notices appeared while staging.
- Integration/database generation/database checks: not run because Task 5A made
  no schema, migration, transaction, binding, discount, or lifecycle change.
- External services and production credentials: not used.

### Implementation commit

```text
3f61ce6aef429466ac5487124459f51148cb79da
feat(growth): add signed referral attribution
```

### Remaining Task 5 boundaries

Task 5B enrollment/binding/discount/lifecycle and Task 5C shared sets/actions/UI
remain unstarted. Task 5A does not activate production economics, disclose a
referral owner, bind a buyer/order, calculate a benefit, or create rewards.

## 5B checkpoint — Private customer referral lifecycle

### Outcome

Implemented Task 5B only. An authenticated active buyer with the existing
verified-primary-email contract can accept exactly one current
`customer_rewards_referrals` terms version/hash and idempotently receive one
stable opaque `ref_` code. The production action boundary enforces exact form
fields, same-origin/CSRF checks, the existing authorization policy, and a
database-backed fixed-window limit. It returns only the buyer's own code and no
owner identity or application-style disclosure fields.

Checkout now reads the 5A cookie only from the HTTP cookie header, verifies its
HMAC server-side, reloads the active code/current referral policy, rejects
self-referral and referral/affiliate/first-order conflicts, and carries the
eligible candidate only inside the opaque authoritative plan. Promotion and
referral acquisition benefits compete by greatest eligible discount and only
the winner is snapshotted; points redemption remains after that winner under
the existing cap/order. Browser input has no code, owner, rate, cap, policy, or
discount authority, and browser results never disclose the referrer.

Checkout preparation revalidates and binds one referral attribution, exact
policy ID/version, one order-growth attribution, and one pending conversion in
the existing serializable order/reward/inventory transaction. Verified payment
adds pending referral points and qualifies the conversion exactly once;
verified delivery moves the unreversed pending amount to available exactly
once; verified cumulative refund/chargeback journals append proportional
incremental reversals and fully reverse the conversion at complete loss. The
approved signed available balance permits a negative referrer balance. No
consumed-redemption restoration rule was added.

No shared-set/page work (5C), cash affiliate commission/payout workflow (Task
6), visual UI (Task 7), schema/migration, external service, production secret,
or production policy activation was added.

### Changed implementation files

- `src/growth/referral-service.ts`
- `src/growth/referral-service.test.ts`
- `src/growth/actions.ts`
- `src/growth/actions.test.ts`
- `src/growth/policies.ts`
- `src/growth/rewards-service.ts`
- `src/commerce/checkout-service.ts`
- `src/commerce/checkout-service.test.ts`
- `src/db/repositories/checkout-repository.ts`
- `src/commerce/checkout-http.ts`
- `src/commerce/checkout-http.test.ts`
- `src/commerce/provider-checkout-orchestration.ts`
- `src/commerce/server-runtime.ts`
- `src/app/api/checkout/quote/route.test.ts`
- `src/app/api/checkout/sessions/route.test.ts`
- `tests/integration/referral-enrollment.test.ts`
- `tests/integration/growth-commerce-transactions.test.ts`

### RED evidence

- Enrollment unit RED: `npm test -- --run src/growth/referral-service.test.ts`
  exited 1 with one failed suite, zero tests, because
  `src/growth/referral-service.ts` did not exist.
- Enrollment PGlite RED: the corrected seven-case fixture failed 7/7 because
  `createPostgresReferralEnrollmentTransaction` did not exist. Candidate lookup
  then failed 5/5 because `createPostgresReferralCandidateLookup` did not exist.
- Discount RED: checkout focused tests had 1 expected failure and 19 passes;
  the referral service received zero calls and referral did not compete with
  promotion.
- Binding RED: the PGlite growth-commerce lane had 1 expected failure and 9
  passes; order preparation succeeded but referral attribution/conversion rows
  were absent.
- Payment, delivery, and reversal REDs each failed the new focused lifecycle
  assertion in turn: no referrer account/pending entry, no available transfer,
  and no proportional referral reversal were present before each implementation.
- HTTP-cookie RED: the controller passed no attribution cookie to checkout.
  No-points projection RED: the monetary discount applied but separate referral
  acquisition fields were absent.
- Real-cookie RED: the PGlite test failed because
  `createPostgresReferralCheckoutService` did not yet exist; the implementation
  then bound the existing 5A verifier to authoritative candidate lookup.

### Transaction, idempotency, and security evidence

- Exact terms commit and replay return one stable active code; stale version,
  hash mismatch, overlapping current terms, review/blocked buyer, future or
  missing verified email, and code collision roll back acceptance/code writes.
- Real 5A HMAC cookie succeeds; tampering, stale/expired cookie, revoked code,
  overlapping policy, self-referral, duplicate referred buyer/first qualified
  order, and customer-versus-affiliate conflict fail closed.
- Post-quote code revocation and overlapping-policy races return
  `facts_changed_retry` and roll back order, checkout attempt, inventory,
  redemption, attribution, and conversion writes together.
- Exact replay leaves one attribution, one order attribution, one conversion,
  one pending referral entry, and one available referral entry.
- The synthetic 10,000-minor order snapshots a 1,000 referral acquisition
  discount instead of the smaller promotion, then 750 points redemption; the
  referrer reward is 412 points from authoritative 8,250 post-discount
  merchandise.
- Cumulative 4,125-minor refund then 8,250-minor chargeback creates only two
  incremental referral reversals totaling 412 points. Replay and a later
  post-full-loss event are no-ops; simulated post-delivery spending permits the
  approved `-312` available balance.
- Action tests reject cross-origin/missing-origin requests, missing acceptance,
  stale/invalid terms fields, extra browser owner authority, and the fixed-window
  excess before enrollment. Results are frozen and privacy-minimal.
- The provider-event lifecycle is required by its production composition; the
  fulfillment seam returns conflict if its required lifecycle dependency is
  absent. Referral writes are part of those existing durable transactions, not
  an optional or swallowed side channel.

### Validation gates

- Focused service/action/checkout/controller/provider/fulfillment/runtime lane:
  exit 0, 10 files, 94/94 tests.
- Required affected PGlite transaction lane: exit 0, 2 files, 26/26 tests.
- Full unit suite: exit 0, 77 files, 847/847 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- Working and staged `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- Database generation/check: not run because 5B made no schema or migration
  change and reused the completed Task 2–4 contracts.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no real
  PostgreSQL concurrency claim is made.
- External services and production credentials: not used.

### Implementation commit

```text
31c4181d6cbc779009c90283274fa6e45121dc06
feat(growth): add private referral lifecycle
```

### Remaining Task 5 boundary

Task 5C shared research sets/actions/pages remains unstarted. Task 5B does not
create shared-set routes, affiliate cash economics, admin growth controls, or
visual account/public UI.

## 5A review fix round 1/5 — Trusted redirect origin

### Outcome

Addressed the independent-review finding that constructing `Location` from
`request.url` allowed a forged request host to produce an attacker-controlled
catalog redirect.

The route now loads the existing validated server environment and constructs
the fixed `/catalog` target exclusively from configured `APP_ORIGIN`. Request
URL, `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `return`, and `redirect`
values have no redirect authority. Invalid codes, inactive/nonexistent codes,
missing runtime, malformed lookup results, and repository failures still return
the same trusted `303` catalog redirect without a cookie.

If validated configuration cannot be loaded or has no `APP_ORIGIN`, the route
returns a cache-disabled empty `503` with neither `Location` nor `Set-Cookie`.
It never falls back to request-controlled origin data.

### Changed implementation files

- `src/app/r/[code]/route.ts`
- `src/app/r/[code]/route.test.ts`

No cookie, runtime lookup, repository, schema, migration, visit, enrollment,
binding, discount, lifecycle, shared-set, affiliate, or UI file changed.

### RED evidence

```text
npm test -- --run src/app/r/[code]/route.test.ts
```

Exit 1: 1 file, 4 expected failures and 1 pass. Eligible, invalid,
inactive/missing-runtime, and missing-config scenarios all exposed the defect:
the first three returned `https://attacker.example/catalog`, while the
missing-config case returned an attacker-derived `303` instead of a no-location
`503`.

### GREEN and validation evidence

- Final route regression: 1 file, 5/5 tests passed.
- Final focused attribution/runtime/route lane: 3 files, 15/15 tests passed.
- Full unit suite: 75 files, 820/820 tests passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- `git diff --check` and staged diff check: exit 0; only expected Windows
  LF/CRLF working-copy notices appeared while staging.
- No external service, production credential, schema, migration, or database
  mutation was used.

### Implementation commit

```text
00752b7
fix(growth): trust configured referral redirect origin
```
