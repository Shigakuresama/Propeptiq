# Preview Readiness and Controlled Handoff

> **PREVIEW PROVISIONED / PRODUCTION CONFIGURED BROWSE-ONLY / CHECKOUT UNAVAILABLE**

The protected Vercel Preview for `feat/propeptiq-lightweight-commerce` is
published at
`https://propeptiq-git-feat-propeptiq-lightweight-commerce-sergiosteam.vercel.app`.
The protected growth Preview for `feat/propeptiq-growth-release` is published at
`https://propeptiq-git-feat-propeptiq-growth-release-sergiosteam.vercel.app`.
Both use branch-scoped, non-secret Preview settings and clearly labeled synthetic
catalog fixtures. The Production alias is
`https://propeptiq-ten.vercel.app`; its non-secret environment is configured for
the owner catalog with every commerce/provider capability disabled. Production
must still be verified against the merged `main` commit after deployment.

No identity, database, payment, storage, email, tax, shipping, or fulfillment
provider is provisioned by these settings. The current release authorization is
limited to the browse-only catalog, branding, merge, and resulting Production
verification. It does not authorize migration application or live commerce.

## Task 10 growth release candidate

The growth release candidate adds editorial rewards presentation, private
customer referrals, neutral shared research sets, a reviewed affiliate ledger,
and one-MFA-admin management. It does not activate a Production policy, create
provider resources, send an affiliate payout, or enable buyer checkout.

Fresh local release evidence is complete on the isolated
`feat/propeptiq-growth-release` candidate:

- unit **132 files / 1,396 tests**;
- PGlite **30 files / 440 tests**;
- Chromium **46/46**, zero skips, across the required responsive, keyboard,
  reduced-motion, zoom-proxy, target-size, and overflow contracts;
- focused privacy/security **12 files / 144 tests** and artifact scanner
  **11/11**;
- lint, workspace boundary, fresh type generation, strict typecheck, two
  no-drift database generations, and database check all passed;
- all 48 migration/history files remained byte-identical with canonical
  manifest SHA-256
  `8174eb00c3e9831a0daff255bbf904cfd5adf21cf7b198d1ffa7797c9180e98e`;
- closed-Production Turbopack and Webpack builds passed and scanned zero
  forbidden local-growth artifacts; and
- a production-built browser pass refreshed and visually inspected all 16
  required screenshots at 375 and 1440, including the uncropped header logo and
  exact `Synthetic local test only` labels.

The guarded real-PostgreSQL contention lane was **NOT RUN** because the two
exact isolation guards were absent. No connection was attempted and no real
PostgreSQL concurrency claim is made. The offline production dependency audit
used only the local advisory cache and reported zero vulnerabilities; no
networked audit was run.

The reviewed growth commit was deployed only to Vercel target `preview` as
deployment `dpl_BUSW3x5PVxyZ6PdRxRMtPBAYsT3g`; Vercel reported **Ready** and
assigned both the immutable deployment URL
`https://propeptiq-h19aci8w7-sergiosteam.vercel.app` and the branch alias above.
Unauthenticated browser access redirected to Vercel login, proving deployment
protection remained enabled. Authenticated deployment requests then proved:

- exact health response `{"status":"ok"}` and no Vercel error/HTTP-500 log
  entries during the verification window;
- the 56-group owner browse catalog and a clearly labeled `Synthetic demo
  catalog` product surface, with no catalog price heading;
- inactive rewards/partner states with no fixture economics, fixed identity,
  local code, or local-growth sentinel in rendered output; and
- quote/session POST denial at `403` and unsigned Stripe webhook denial at
  `400`, with no payment, order, payout, or provider effect.

Fifteen branch-scoped non-secret variables are present for this growth Preview.
They enable only the synthetic demo catalog and exact owner browse publication;
`LOCAL_TEST_DRIVER`, auth, database, payments, storage, email, tax, shipping,
fulfillment, commerce-live, and payments-live modes are all disabled. Generic
Vercel/Neon integration variables exist at the project level but are ignored
because `DATABASE_MODE=disabled`. No Production variable was changed.

## Browse-only boundary

- Preview renders the owner-supplied browse-only catalog only when its exact
  publication ID is configured. The separate commerce catalog remains limited
  to explicitly labeled synthetic demo records.
- Buyer quote and payment-session creation remain closed before any provider
  effect. Current unauthenticated growth-Preview probes return `403`; a disabled
  runtime may otherwise use its documented no-store `503` denial. Shipping,
  tax, and payment-session creation remain unavailable.
- Preview is neither live-capable nor local-test-capable. The guarded local
  commerce harness is not available in Preview.
- This buyer-checkout boundary does not claim that staff or webhook runtimes
  are available or unavailable; neither is authorized for exposure here.
- Production buyer checkout remains inert because all provider and live
  capability flags are explicitly disabled.

## Current deployment target matrix

Vercel supplies `VERCEL_ENV` for each deployment target. The application values
below are the current non-secret settings; neither target contains provider
credentials.

### Protected Preview

```dotenv
APP_ENV=preview
VERCEL_ENV=preview
APP_ORIGIN=https://propeptiq-git-feat-propeptiq-lightweight-commerce-sergiosteam.vercel.app
CATALOG_DEMO_MODE=enabled
BROWSE_CATALOG_PUBLICATION=owner-pdf-2026-08-27-07cd4aa0-v1
LOCAL_TEST_DRIVER=disabled
AUTH_MODE=disabled
DATABASE_MODE=disabled
PAYMENTS_MODE=disabled
STORAGE_MODE=disabled
EMAIL_MODE=disabled
TAX_MODE=disabled
SHIPPING_MODE=disabled
FULFILLMENT_MODE=disabled
COMMERCE_LIVE_CAPABILITY=disabled
PAYMENTS_LIVE_CAPABILITY=disabled
```

The growth Preview uses the same disabled matrix with branch scope
`feat/propeptiq-growth-release` and
`APP_ORIGIN=https://propeptiq-git-feat-propeptiq-growth-release-sergiosteam.vercel.app`.

### Production browse-only

```dotenv
APP_ENV=production
VERCEL_ENV=production
APP_ORIGIN=https://propeptiq-ten.vercel.app
CATALOG_DEMO_MODE=disabled
BROWSE_CATALOG_PUBLICATION=owner-pdf-2026-08-27-07cd4aa0-v1
LOCAL_TEST_DRIVER=disabled
AUTH_MODE=disabled
DATABASE_MODE=disabled
PAYMENTS_MODE=disabled
STORAGE_MODE=disabled
EMAIL_MODE=disabled
TAX_MODE=disabled
SHIPPING_MODE=disabled
FULFILLMENT_MODE=disabled
COMMERCE_LIVE_CAPABILITY=disabled
PAYMENTS_LIVE_CAPABILITY=disabled
```

## Identity and data restrictions

Preview access remains protected by Vercel authentication. `AUTH_MODE=disabled`
and `DATABASE_MODE=disabled` mean the application creates no buyer identity or
commerce records. Do not admit real customer, buyer, order, address,
attestation, payment, refund, shipment, or provider data. Production publishes
only the pinned owner-supplied browse catalog and never the synthetic demo
fixtures.

## Phase evidence already collected

The evidence below is retained from the pre-publication Task 7 checkpoint.
Statements in that historical record saying Preview was not published were true
when captured and no longer describe the external deployment state. The current
deployment contract is recorded above; none of the historical evidence
activates Production commerce.

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

The current authorization covers pushing the reviewed catalog/branding changes,
merging pull request 2, and verifying its browse-only Production deployment.
Resource or identity provisioning, migration application, provider
configuration, and Production commerce-capability activation remain separate,
unauthorized future actions. Authorization for this browse-only release does not
authorize any of them.
