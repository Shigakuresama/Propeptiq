# Preview Readiness and Controlled Handoff

> **PREPARED / NOT PUBLISHED / NOT PROVISIONED / BROWSE-ONLY; CHECKOUT UNAVAILABLE**

This document describes a local preparation contract. It does not claim that a
Preview deployment, account, database, provider resource, domain, credential,
or synthetic identity exists. It does not authorize publication, provisioning,
migration application, push, merge, deployment, or Production activation.

## Browse-only boundary

- Preview may render the owner-supplied browse-only catalog only when its exact
  publication ID is configured. The separate commerce catalog remains limited
  to explicitly labeled synthetic demo records.
- Buyer quote and payment-session creation remain closed with no-store `503`
  responses. Shipping, tax, and payment-session creation are unavailable.
- Preview is neither live-capable nor local-test-capable. The guarded local
  commerce harness is not available in Preview.
- This buyer-checkout boundary does not claim that staff or webhook runtimes
  are available or unavailable; neither is authorized for exposure here.
- Production buyer checkout remains inert regardless of flags at this
  checkpoint.

## Placeholder-only target matrix

The following is the exact target configuration for a future separately
authorized Preview. Bracketed values and `REPLACE_WITH_...` values are
documentation placeholders, not runnable credentials or evidence that any
resource exists.

```dotenv
APP_ENV=preview
VERCEL_ENV=preview
APP_ORIGIN=https://preview.propeptiq.example.invalid
CATALOG_DEMO_MODE=enabled
BROWSE_CATALOG_PUBLICATION=owner-pdf-2026-08-27-07cd4aa0-v1
LOCAL_TEST_DRIVER=disabled
LOCAL_TEST_SECRET=
AUTH_MODE=test
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_WITH_SYNTHETIC_PREVIEW_VALUE
CLERK_SECRET_KEY=sk_test_REPLACE_WITH_SYNTHETIC_PREVIEW_VALUE
CLERK_WEBHOOK_SIGNING_SECRET=
RATE_LIMIT_SECRET=<unique preview-only value of at least 32 characters created at authorized provisioning time>
DATABASE_MODE=test
TEST_DATABASE_URL=postgresql://<reserved-isolated-preview-test-database-placeholder>
TEST_DATABASE_CONFIRMATION=isolated-test-database
DATABASE_URL=
DATABASE_MIGRATION_URL=
PAYMENTS_MODE=test
STRIPE_ACCOUNT_ID=acct_REPLACE_WITH_SYNTHETIC_TEST_ACCOUNT
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_SYNTHETIC_PREVIEW_VALUE
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_SYNTHETIC_PREVIEW_VALUE
STORAGE_MODE=disabled
EMAIL_MODE=disabled
TAX_MODE=disabled
SHIPPING_MODE=disabled
FULFILLMENT_MODE=disabled
COMMERCE_LIVE_CAPABILITY=disabled
PAYMENTS_LIVE_CAPABILITY=disabled
```

`APP_ORIGIN` uses the reserved `.invalid` namespace until publication is
separately authorized. `CLERK_WEBHOOK_SIGNING_SECRET` stays blank unless a
separate authorization provisions that webhook. Provisioning must create every
secret as a unique Preview-only value; no value may be copied from Local or
Production.

## Identity and data restrictions

Future access must be protected before Preview publication. Reviewers must use
pre-created synthetic test identities; `AUTH_MODE=test` proves credential mode
only and does not prove an identity is synthetic. Do not admit real customer,
buyer, order, address, attestation, payment, refund, shipment, provider, or
catalog data. Do not create a technical allowlist as part of this checkpoint.

## Phase evidence already collected

These focused results are complete on the current frozen candidate. They prove
the local policy and browse-only Preview contracts only; they do not publish or
provision Preview and do not activate Production commerce.

| Evidence | Recorded result | Final-candidate status |
|---|---|---|
| Phase A public projection unit proof | 26/26 passed | **COMPLETE** |
| Phase A catalog repository PGlite proof | 2/2 passed | **COMPLETE** |
| Phase A catalog/content focused regression | 93/93 passed | **COMPLETE** |
| Phase A adversarial review and same-review repair | APPROVE; no remaining Critical/Important finding | **COMPLETE** |
| Phase B exact Preview/config/runtime/route focused proof | Final fix-round suite: 7 files / 86 tests passed | **COMPLETE; the fresh broader 18-file / 243-test proof below includes the three added account-state tests** |
| Phase B public-storefront browser proof | 14/14 passed, including the explicit synthetic-demo notice and repaired 44px header-brand target | **COMPLETE** |
| Phase B independent Preview/config review | Same reviewer: ADDRESSED — APPROVE; no new Critical/Important/Moderate breakage | **COMPLETE** |

## Final evidence ledger

Fresh repaired-candidate results below are current. The original pre-E2E
generated-state tree remains unrecoverable; after explicit user authorization,
the current post-E2E tree became the disclosed replacement preservation
baseline and was restored exactly after the isolated gates.

| Final field | Status |
|---|---|
| Full unit and PGlite suites | **Fresh repaired candidate PASS — unit 62 files / 708 tests; PGlite 16 files / 284 tests** |
| Full browser suite | **Fresh repaired candidate PASS — Playwright 31/31 with zero skips after the header-brand repair; 375/768/1024/1440, keyboard/focus, reduced-motion, accessibility, and target-size coverage passed** |
| Normal Chrome page zoom at 200% | **PASS — genuine Chrome reported DPR 3, `innerWidth=1252`, `outerWidth=2560`, and visual scale 1; every reviewed public, authenticated, and administration route had one main region, zero horizontal overflow, and zero off-viewport visible controls** |
| Focused content/Preview/privacy proof | **Fresh repaired candidate PASS — 18 files / 243 tests** |
| Workspace boundary, lint, artifact-scanner, and repaired-candidate type generation/typecheck | **PASS — workspace boundary; lint with zero warnings; scanner 9/9; fresh `next typegen`; ordinary typecheck** |
| Closed-Production Turbopack build plus immediate artifact scan | **PASS — 718 deployable files / 49,762,007 bytes / zero forbidden matches; complete generated tree preserved separately** |
| Closed-Production Webpack build plus immediate artifact scan | **PASS — 227 deployable files / 8,387,301 bytes / zero forbidden matches; complete generated tree preserved separately** |
| Generated-state preservation and restoration | **PASS for the explicitly user-authorized replacement baseline — after responsive review, the owned server tree was stopped, the browser-generated tree was preserved intact, and the worktree was restored to 1,551 files / 1,230,127,489 bytes / canonical per-file manifest SHA-256 `9bcf9d8088474f3acdf4831e0f7e9890e1062058a1924bf1b3d0ad8a40ff611d`; the exact `pg` Junction target remains intact. The original 1,548-file baseline remains unrecoverable** |
| Migration generation/check and history-hash stability | **PASS — generation twice reported no schema changes; check passed; before/between/after remained 12 files / 815,841 bytes / SHA-256 `45103595542df258fdb075aa9bf0ef6af3b4917529cd7ab062506cbed4cfa6c2`** |
| Generated-state evidence root | `C:\Users\Sergio\AppData\Local\Temp\propeptiq-task7-authorized-baseline-20260827110116` |
| Dependency audit (`npm audit --omit=dev`) | **PASS — found 0 vulnerabilities** |
| Final content-policy review and same-reviewer closure | **APPROVE; no remaining Critical/Important finding** |
| Final Preview/config/security review of this amended handoff | **ADDRESSED — APPROVE; no new Critical/Important/Moderate breakage** |
| Phase C documentation same-auditor review | **APPROVE; no remaining Critical/Important/Moderate finding** |
| Final responsive/accessibility review | **APPROVE on repaired functional candidate `ef9c2aaad7291948a13e600f9874e4ff34490747738ec39e9fe1a8a5ac3bc883`; no Critical/Important/Moderate finding** |
| Independent full-branch review | **Initial review APPROVE; final amended-candidate verifier Rule A: PASS** |
| Final verifier | **Rule A: PASS — no Critical/Important/Moderate/Minor findings; read-only checks only, with no tests, builds, network, or external action performed in that review** |
| Final intended file count/stat | **29 files / 1,672 insertions / 112 deletions** |
| Guarded PostgreSQL execution status | **NOT RUN — both exact isolation guards were absent; no connection and no locking claim** |
| Final clean tracked status | **PENDING** |
| Final commit SHA | **PENDING; record only in the ignored report and final response after commit, never in this same-commit document** |

The guarded PostgreSQL lane is statically three files/twenty tests across
checkout, provider-event, and refund/fulfillment contention. It may run only if
both a narrowly isolated `TEST_DATABASE_URL` and exact
`TEST_DATABASE_CONFIRMATION=isolated-test-database` already exist. Otherwise
its final result must be recorded as **NOT RUN**, with no database connection or
PostgreSQL locking/concurrency claim.

## Generated-state preservation record

The original pre-E2E tree remains unrecoverable from available evidence at
1,548 files / 1,220,601,012 bytes / SHA-256
`6b0b3a1a1882f46942b55496e0b48d242e87a13a72d5d46a4bc0b95a7311236d`.
The user's explicit authorization adopted the current post-E2E tree as the
replacement preservation baseline. Its 1,551 canonical file rows total
1,230,127,489 bytes. Ordinal path order, tab-separated rows, LF separators,
and no final newline produce SHA-256
`9bcf9d8088474f3acdf4831e0f7e9890e1062058a1924bf1b3d0ad8a40ff611d`.
The controller's current-culture TSV serialization produces
`652ce1e4c003d4c30bb1282e3d668c4def932992f3a63f656865c376c643b6ea`,
while the legacy current-culture pipe/CRLF-with-final-newline serialization
produces `4f836c0d392f825ea425029f2420232db2dfa3706d7b2ae154f8187c8256489b`.
Those are serialization differences over the same per-file records, not
evidence of content drift.

The first attempted backup is retained as evidence because generic PowerShell
copying materialized the `pg` Junction target and added twenty files; the live
source still had zero added, missing, or changed canonical records. A second
backup made with reparse-preserving Windows semantics matched all 1,551 rows
and retained the exact Junction target. The native same-volume move, pre- and
post-restore checks, and retained faithful backup all reproduce the authorized
manifest and Junction topology. Fresh typegen/typecheck and both closed builds
were isolated and their complete outputs retained under the evidence root.

For the responsive browser lane, the exact launcher/listener ancestry was
revalidated before shutdown. Only the owned tree rooted at launcher PID
`688076` and serving through listener PID `238028` was stopped; afterward port
4631 had zero listeners and zero Node processes referenced this worktree. The
browser-generated tree was moved intact, without deletion, to
`C:\Users\Sergio\AppData\Local\Temp\propeptiq-task7-authorized-baseline-20260827110116\browser-generated-next-after-responsive-20260827-131201-0186974-1419339f`.
Its exact pre/post-move manifest is 814 files / 864,990,175 bytes / canonical
SHA-256 `690abcb022396866114cca383c2902052d4d06f708b0c392ab8973301312ff08`,
with its `pg` Junction topology unchanged. The isolated authorized replacement
baseline was then moved natively back to the worktree and reproduced all 1,551
canonical rows, bytes, hash, and the exact canonical-worktree `node_modules\pg`
Junction target.

## Current local-closure state

The selected real Chrome extension browser completed genuine normal page zoom
at 200%: DPR doubled from 1.5 to 3, layout width changed from 2274 to 1252 while
`outerWidth` remained 2560, and visual scale remained 1. Public routes `/`,
`/catalog`, `/catalog/synthetic-reference-alpha`, `/cart`, `/quality-records`,
and `/research-use-policy`, plus authenticated `/checkout`, `/account`,
`/account/orders`, `/admin`, `/admin/products`, and `/admin/shipments`, each had
one main region, zero horizontal overflow, and zero off-viewport visible
controls. The header-brand regression first failed at 36 x 119.828125 CSS px,
then passed at 44 x 119.828125; all four footer targets remained 44 x 343. The
fresh full browser lane passed 31/31 with zero skips. The responsive reviewer
APPROVED the repaired functional candidate with no
Critical/Important/Moderate finding.

Task 7 lines 157 through 162 are all checked after the final independent
verifier returned Rule A: PASS with no Critical/Important/Moderate/Minor
findings. Its review was read-only and performed no tests, builds, network, or
external action. The final commit SHA and clean post-commit status remain
pending; the prior Preview/security reviewer approval remains unchanged.

## Unresolved launch blockers

- qualified legal review and a counsel-approved real SKU/state allowlist;
- authoritative real product, package, price, supplier, lot, inventory, and COA
  manifest data;
- payment-provider acceptance and separately authorized live configuration;
- tax configuration and shipping-service availability;
- an owned fulfillment/warehouse process and physical/carrier evidence;
- separately provisioned and isolated identity/database/provider resources;
- an authorized migration-apply and reconciliation procedure;
- runtime downstream-effect scheduling/wake-up, a production sink/Resend
  delivery, bounded backoff/dead-letter operations, alerts, structured
  telemetry, webhook rate limiting, and external firewall configuration.

External inputs are necessary, not sufficient. None provisions a resource or
activates checkout by itself.

## Branch, range, and inventory handoff

- Branch: `feat/propeptiq-lightweight-commerce`
- Task 7 tracked base: `b0b4e232f65845cc803965b7a8c5ae4d8efefa1a`
- Local branch merge base: `61fe29e`
- Final independent full-branch review range: `61fe29e..PENDING_FINAL_CANDIDATE`
- Final candidate/commit SHA: **PENDING and deliberately external to this
  same-commit document**
- Current intended final pre-commit inventory: **29 paths**
- Exact current pre-commit stat: **29 files / 1,672 insertions / 112 deletions**
- Responsive-review functional candidate fingerprint:
  `ef9c2aaad7291948a13e600f9874e4ff34490747738ec39e9fe1a8a5ac3bc883`
- The exact post-evidence-update 29-path fingerprint is recorded in the ignored
  report and progress ledger after this tracked handoff is frozen; embedding its
  own digest here would change that digest.
- Final tracked status/clean handoff: **PENDING**

Current intended Task 7 commit paths are:

```text
.env.example
src/app/api/checkout/quote/route.test.ts
src/app/api/checkout/sessions/route.test.ts
src/app/checkout/page.test.tsx
src/app/checkout/page.tsx
src/catalog/catalog-source.test.ts
src/catalog/public-catalog.test.ts
src/catalog/public-catalog.ts
src/commerce/server-runtime.test.ts
src/commerce/server-runtime.ts
src/components/site/site-header.tsx
src/config/commerce-capability.test.ts
src/env.test.ts
tests/e2e/public-storefront.spec.ts
tests/integration/catalog-repository.test.ts
docs/adr/0004-payments.md
docs/adr/0005-email-observability-rate-limiting.md
docs/architecture/payments.md
docs/architecture/system-architecture.md
docs/deployment/environments-and-recovery.md
docs/deployment/preview-readiness-and-handoff.md
docs/runbooks/README.md
docs/runbooks/compliance-holds.md
docs/runbooks/failed-orders.md
docs/runbooks/refunds-reconciliation.md
docs/security/threat-model.md
docs/superpowers/plans/2026-08-24-propeptiq-lightweight-commerce.md
docs/testing.md
tests/integration/README.md
```

The intended pre-commit inventory is exactly **29 paths**: the prior 28-path
candidate plus the repaired public header component. The ignored progress ledger is
`.superpowers/sdd/2026-08-24-propeptiq-lightweight-commerce/progress.md`; the
ignored Task 7 report is
`.superpowers/sdd/2026-08-24-propeptiq-lightweight-commerce/task-7-report.md`.
Neither belongs in the commit.

## Separate authorizations after this checkpoint

Each of the following is a distinct future action and remains unauthorized and
unperformed: push, pull-request creation, merge, Preview publication, resource
or identity provisioning, migration application, provider configuration,
Production deployment, and Production capability activation. Authorization for
one does not authorize any other action.
