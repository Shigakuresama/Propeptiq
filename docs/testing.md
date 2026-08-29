# Testing Strategy

## Test layers

- **Domain unit tests:** automatic buyer activation, exact gate decisions/reason codes, destination precedence, explicit review snapshots, content/publication policy, price/promotion calculations, order/payment/inventory/refund/fulfillment transitions.
- **Repository integration tests:** Drizzle queries and constraints against an isolated database, guarded migrations, provider event/hash uniqueness, concurrent inventory/refund/shipment behavior.
- **Adapter contract tests:** Clerk verification projection, Stripe raw-body signature verification and idempotency, Blob authorization, and the durable downstream-effect repository/lease-worker factory with visibly injected test sinks.
- **Component/browser tests:** public catalog/prices/promotions/cart, preserved cart through sign-in, account attestation, own-order authorization, staff MFA/capability denial, read-only success route, safe empty/error states.
- **Responsive/accessibility tests:** 375px, 768px, 1024px, and 1440px; keyboard-only; visible focus; reduced motion; 200% zoom; no horizontal overflow; accessible navigation sheet and Proof Rail.

## Required negative cases

- Unverified email, under-21/no confirmation, invalid purpose, or stale/missing attestation.
- Buyer `blocked`; buyer `review` without matching exact snapshot; snapshot changed by cart, buyer status, attestation, or destination.
- Territory, exact blocked product override, blocked group rule, or missing destination rule; missing policy does not create review.
- Inactive product/price/lot, insufficient inventory, missing allowed destination, or analytical claim without corresponding evidence.
- Production test-fixture/demo mode, browser price/promotion tampering, unavailable tax/shipping, disabled/unaccepted provider.
- Invalid webhook signature, duplicate event, same event ID with conflicting hash, out-of-order event, success-page refresh.
- Concurrent over-reservation, over-refund, or duplicate fulfillment release/shipment.
- Cross-user order/object access, nonstaff route access, missing MFA, insufficient staff capability.
- Human/veterinary outcome, dosing, administration, reconstitution, treatment, or misleading overall-impression content.

## Documentation checks

The binding-document search covers README, design-system, active requirements/traceability, compliance, architecture, ADRs, security, testing, deployment, runbooks, and design contracts. It may exclude files explicitly labeled historical or superseded. Findings must distinguish a prohibited active requirement from text that explicitly rejects that requirement.

## Historical Task 1 documentation-only gate

Task 1 used this narrow documentation-only gate:

```powershell
npm run verify:workspace-boundary
npm test
npm run lint
git diff --check
```

This historical list is not sufficient for later checkpoints.

## Task 6 offline checkpoint matrix

`npm run verify` alone is incomplete for Task 6. Run and record every applicable lane below against one unchanged candidate. A skipped, stopped, or unavailable command is not a pass.

1. Full unit suite: `npm test`.
2. Full PGlite suite: `npm run test:integration`.
3. Full synthetic browser acceptance: `npm run test:e2e`.
4. Lint with zero warnings: `npm run lint`.
5. Focused privacy/security behavior:

   ```powershell
   npx vitest run src/commerce/checkout-http.test.ts src/commerce/webhook-http.test.ts src/commerce/checkout-success-read.test.ts src/auth/local-commerce-driver.test.ts src/commerce/local-harness-http.test.ts 'src/app/__synthetic_local_checkout/local-harness-routes.test.tsx' src/commerce/local-payment-provider.test.ts src/security/safeguards.test.ts
   ```

6. Canonical worktree and exclusion proof: `npm run verify:workspace-boundary`.
7. Artifact-scanner regression: `npm run test:artifact-scanner`.
8. With inherited `.next` isolated and later restored exactly, run `npx next typegen` followed by `npm run typecheck`.
9. In a production identity with every local/demo/test/live capability disabled, no external credential, and `APP_ORIGIN` set to a reserved non-routable HTTPS origin, run the default Turbopack `npm run build`, then `npm run verify:production-artifacts` against that actual deployable output. Preserve the evidence separately, run `npx next build --webpack`, and scan the Webpack deployable output the same way. Do not contact an external service.
10. Record SHA-256 for every file under `src/db/migrations`, then run `npm run db:generate` twice and `npm run db:check`. Recompute and compare every SQL, `meta/_journal.json`, snapshot/history, and README hash; require the migration directory to remain clean. If generation creates or changes anything, stop and preserve/report it without deleting or restoring it.
11. Run `npm run test:postgres:checkout` only when both a narrowly isolated `TEST_DATABASE_URL` and exact `TEST_DATABASE_CONFIRMATION=isolated-test-database` are already present. Otherwise record the three files / twenty tests as **NOT RUN**, make no connection, and make no PostgreSQL locking/concurrency claim.
12. Run `git diff --check`, confirm no unmerged path, inventory every intended tracked and ignored handoff file, and record `git status --short --branch`.

If `.next` must move for clean type/build proof, first record its file count, byte count, and manifest SHA-256 outside the worktree; move it only to a unique explicit temporary path; preserve each fresh evidence tree outside the worktree; restore the inherited path; and verify the identical manifest. Never recursively delete an inherited generated tree.

Record exact commands, exit codes, counts, viewports/routes, production-disabled values, evidence locations, and unresolved external checks. Local unit/PGlite/synthetic-browser/build evidence never establishes legal, provider, destination, tax, shipping, fulfillment, warehouse, or launch approval.

The downstream-effect tests establish repository leases, idempotency, and the
worker factory with an injected sink only. They do not establish a runtime
scheduler/wake-up, production email/Resend delivery, bounded backoff or
dead-letter operations, alerts, structured telemetry, external firewall
configuration, or webhook rate limiting. Those claims require separate
implementation and operational evidence.

Dependency audit, network package metadata, preview/release preparation, publication, deployment, and production activation remain Task 7 work and are excluded from the Task 6 checkpoint.

## Task 10 growth release matrix

Task 10 verifies the rewards, customer-referral, neutral shared-set, and reviewed
affiliate experience without activating any Production policy, provider, or
commerce capability. The deterministic browser driver and its fixed actors are
local-only test doubles, and every authoritative-looking test surface is labeled
`Synthetic local test only`.

The fresh release-candidate results were:

| Lane | Result |
|---|---|
| Unit | **PASS — 132 files / 1,396 tests** |
| PGlite integration | **PASS — 30 files / 440 tests** |
| Chromium browser | **PASS — 46/46, zero skips** |
| Focused privacy/security | **PASS — 12 files / 144 tests** |
| Artifact-scanner regression | **PASS — 11/11** |
| Workspace boundary | **PASS** |
| Lint | **PASS — zero warnings** |
| Fresh Next type generation and strict typecheck | **PASS** |
| Database generation/check | **PASS — both generations reported no schema changes; check passed** |
| Migration/history stability | **PASS — 48 files unchanged; canonical manifest SHA-256 `8174eb00c3e9831a0daff255bbf904cfd5adf21cf7b198d1ffa7797c9180e98e`** |
| Closed-Production Turbopack build and scan | **PASS — 1,016 deployable files / 54,144,678 bytes / zero forbidden matches** |
| Closed-Production Webpack build and scan | **PASS — 297 deployable files / 9,730,927 bytes / zero forbidden matches** |
| Production dependency tree | **PASS — `npm ls --omit=dev --depth=0`** |
| Offline production dependency audit | **PASS from the local advisory cache — zero vulnerabilities; no network audit was run** |
| Guarded real-PostgreSQL contention | **NOT RUN — both exact isolation guards were absent; no connection and no PostgreSQL concurrency claim** |
| Protected growth Preview | **PASS — Vercel target Preview Ready; protection redirect confirmed; authenticated health/content checks passed; checkout/session denied; zero error/HTTP-500 log entries** |

The browser lane covers 375, 768, 1024, and 1440 CSS pixels; keyboard focus;
reduced motion; minimum targets; 16px explanatory text; progress semantics;
narrow ledger reflow; a labeled 200% CSS zoom proxy; and horizontal-overflow
checks. Literal browser zoom is not claimed by this automated lane. A separate
production-built screenshot pass also passed 1/1 and refreshed 16 inspected PNGs
at 375 and 1440 for home, catalog, rewards, referrals, partner, shared set, cart,
and the loyalty-policy admin resource. The compiled screenshots contain no
development issue overlay and show the complete, uncropped header logo.

The first full browser run correctly failed on a 4.39:1 contrast regression in
the new active-program eyebrow; the color was repaired and the focused Axe check
then passed before the final 46/46 run. The first full unit and PGlite runs also
exposed stale pre-growth expectations and setup timeouts; their focused repairs
passed before the complete suites were rerun. These failures are retained in the
ignored Task 10 report as RED evidence rather than being described as passes.

Generated outputs are preserved outside the worktree under
`C:\Users\Sergio\AppData\Local\Temp\propeptiq-task10-release-20260829-1455`.
The isolated candidate had no inherited `.next` baseline. Each generated tree
was moved intact; none was recursively deleted or substituted for external
deployment evidence.

Local/PGlite/browser/build proof does not establish legal approval, real catalog
or destination approval, Stripe acceptance, tax/shipping readiness, fulfillment,
affiliate payout operations, or Production activation.

The protected branch Preview is
`https://propeptiq-git-feat-propeptiq-growth-release-sergiosteam.vercel.app`.
Its immutable verified deployment was
`https://propeptiq-h19aci8w7-sergiosteam.vercel.app`. Browser automation proved
the Vercel login boundary; Vercel-authenticated deployment requests verified the
actual protected app without weakening that boundary. The Preview contains no
synthetic growth identity or active economics: rewards and partner values remain
inactive until real database policy records exist. It does expose the clearly
labeled synthetic commerce demo route, while every live/provider capability is
disabled. This Preview proof is not Production proof.
