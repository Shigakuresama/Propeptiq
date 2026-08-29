# Task 9 Report — Security, terms, and adversarial content hardening

## Scope and checkpoint

- Started from the clean Task 8 closure at `c6571e4`.
- Implementation commit `c553b21` added the Task 9 abuse defenses; review-fix commit `83cefe0` closed the two independent-review blockers.
- No production growth policy or terms record was activated, no production database was contacted, no payout was executed, and no Stripe, Clerk, Vercel, or other external account was mutated.
- The skeptic lens targeted forgery, replay, enumeration, shared-budget denial of attribution, value duplication, terms substitution, and prohibited public claims. The architect lens kept authority at exact server/database boundaries. The minimalist lens rejected document uploads, raw-IP retention, device fingerprinting, routine customer approval, dual administration, and customer MFA.
- The adversarial-review bundle still lacks its referenced `brain/principles.md`; the available skeptic/architect/minimalist instructions were applied, and opposite-model read-only review was used instead of claiming the missing corpus.

## Concrete abuse sequences tested or re-proved

- Tampered, expired, future-dated, malformed, or wrong-environment attribution cookies fail closed.
- Malformed referral/affiliate codes, browser return URLs, missing platform caller address, inactive records, ambiguous current policy, and lookup/limiter failure produce the same no-cookie catalog redirect.
- Anonymous code lookups use a one-minute per-caller budget derived from a Vercel-provided address. The persisted rate-limit key is an HMAC digest; raw address, raw code, user agent, and device facts are not written or returned. One caller exhausting a public code cannot consume another caller's allowance.
- Preview and production mutations fail closed when `APP_ORIGIN` is missing. Cross-origin requests remain denied. Invalid rate-limit counter values fail closed.
- Self-referral, duplicate referred-account facts, referral/affiliate overlap, order-program XOR violations, duplicate provider/refund/shipment effects, duplicate commission approval, and payout double-consumption remain denied by the existing service, transaction, and schema tests.
- Payout forms now carry a stable per-render command token. Create/paid idempotency fingerprints bind actor authority, profile or payout/version, stable key, provider, and external reference while excluding per-attempt correlation IDs and server timestamps. Response-loss retries return the original record; changed business facts conflict; eligible commissions are still selected and consumed once under row locks.
- Exactly one current growth-terms record is loaded. Its text must match the stored server-computed SHA-256 hash and pass the public terms surface. Version and UTC effective date render publicly; browser text/hash remains non-authoritative and transaction mismatch/overlap/missing-current paths remain rollback-only.
- General catalog/admin copy retains the strict prohibited-use scanner. The program-terms surface permits ordinary administrative/legal verbs and the narrow negated restriction “not intended for human or veterinary use,” but still blocks product administration, dosing, reconstitution, injection, treatment outcomes, positive human/veterinary positioning, urgency, fabricated popularity/savings, unsupported comparisons, and implied-use testimonials.

## Test-first RED evidence

- Initial Task 9 focused RED: 8 test files failed, with 22 failed and 97 passed assertions, before origin/counter hardening, anonymous lookup limiting, terms content/effective-date handling, payout command tokens, and artifact sentinels were implemented.
- Initial artifact RED: 1 of 10 scanner cases failed because the synthetic growth policy bundle, identities, codes, financial state, and local growth module path were not yet detected.
- Payout response-loss RED: the isolated PGlite payout file failed 2 tests and passed 11 because fresh correlation IDs/server times produced `idempotency_conflict` for the same stable business command.
- Independent review fix RED 1: 3 files failed with 6 failed and 8 passed tests, proving the original shared per-code limiter allowed targeted attribution denial and routes did not require a platform caller signal.
- Independent review fix RED 2: 2 files failed with 2 failed and 84 passed tests, proving ordinary legal phrases such as “administered by” and “prevent fraud” were incorrectly rejected by the general merchandising scanner.

## GREEN and final Task 9 gates

- Focused Task 9 unit matrix: 15 files and 239 tests passed.
- Payout PGlite integration: 1 file and 13 tests passed, including fresh-correlation/time replay and changed-business-fact conflicts.
- Production artifact scanner: 10 of 10 tests passed.
- `npm run typecheck` passed.
- `npm run lint` passed with zero warnings.
- `npm run verify:workspace-boundary` passed; quarantine remains excluded from package, search, build, lint, and test roots.
- `git diff --check` passed with only the repository's existing Windows line-ending advisories.

## Artifact sentinel coverage

- Exact synthetic growth-policy bundle sentinel.
- Fixed local growth identity UUID namespace.
- Exact local referral, affiliate, and shared-set codes.
- Fixture-only local financial state.
- `local-commerce-driver` implementation module paths in server/static artifacts.
- Both Turbopack and Webpack local-auth/payment/harness alias configuration.
- Scanner output reports categories/counts without echoing forbidden fixture values.

## Documentation updates

- `docs/security/threat-model.md` now binds growth assets, forgery/enumeration, duplicate value, terms substitution, payout replay, privacy/retention, abuse response, low-friction exclusions, and external activation gates.
- `docs/architecture/authentication-authorization.md` now documents opaque codes, signed 30-day cookies, Vercel-derived HMAC caller limiting, exact terms authority, customer low friction, owner history, and one-MFA-admin growth authority.
- `docs/architecture/domain-policies.md` now documents exact terms/hash loading, referral-or-affiliate order exclusivity, append-only ledgers, verified lifecycle reversals, external payout evidence, stable business-command replay, content screening, and production-disabled growth activation.

## Independent review

- Two initial whole-package high-effort reviewer attempts produced no output within bounded waits and were stopped; no approval was inferred from either attempt and neither changed files.
- A file-scoped payout review returned **APPROVE** with no Critical/Important finding. It confirmed command tokens do not authorize value, commission row locking prevents double consumption, fingerprints retain every business fact, CAS/MFA remain intact, and retries preserve original external evidence.
- A file-scoped attribution review found one Important targeted-DoS defect in the shared per-code budget. A file-scoped terms/artifact review found one Critical false-positive defect from applying catalog-level lexical rules to ordinary legal verbs.
- Both findings were reproduced with failing tests and fixed in `83cefe0`.
- Exact fix re-review returned **APPROVE** with both findings closed and no new Critical/Important issue. Non-blocking limits only: distributed attackers can rotate genuine source addresses, so Vercel Firewall remains an external defense; the content scanner remains defense in depth rather than a substitute for counsel review.

## Remaining external truth

- Production growth activation remains disabled pending real commerce data, provider acceptance, destination rules, tax/shipping, fulfillment, counsel-reviewed final terms, approved economics, and an accountable payout operation.
- The direct Vercel deployment boundary supplies the trusted client-address header. A different proxy topology requires a separately reviewed trust configuration.
- Task 10 owns full unit/integration/E2E, responsive and accessibility evidence, dual production builds and emitted-artifact scans, database/migration stability, dependency checks, optional guarded PostgreSQL concurrency, and final branch/PR/release verification.

**Checkpoint:** Ordinary customers retain the lightweight flow while attribution, terms, growth value, payout records, and public claims fail closed against the concrete forgery, replay, denial, substitution, and misleading-positioning sequences tested here.
