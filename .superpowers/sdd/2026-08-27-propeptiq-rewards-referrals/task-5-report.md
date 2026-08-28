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
