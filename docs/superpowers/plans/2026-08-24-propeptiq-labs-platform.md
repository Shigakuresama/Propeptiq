# PROPEPTIQ LABS Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-capable, U.S.-first research-material commerce application whose public content, account approval, jurisdiction decisions, payment handling, and fulfillment controls deny unsafe or unsupported activity by default.

**Architecture:** A Next.js 16 App Router application on Vercel uses server components by default, Clerk for identity, a server-only authorization/data-access layer over Neon PostgreSQL and Drizzle, and explicit adapters for hosted payments, private object storage, and transactional email. Pure domain policies own eligibility and state transitions. External capabilities remain disabled until configuration and database launch gates both pass. The final catalog is deliberately empty until actual approved records are supplied.

**Tech Stack:** Node.js 24, npm 11, Next.js 16.3.2, React 19.2.8, strict TypeScript, Tailwind CSS 4, shadcn/ui and Radix, Clerk 7, Neon serverless driver, Drizzle ORM and SQL migrations, Stripe-hosted Checkout, private Vercel Blob, Resend, Vercel Firewall/Observability/OpenTelemetry, Vitest, Testing Library, Playwright, and axe.

**Spec:** `docs/product-requirements.md`

## Global Constraints

- Treat `C:\Users\Sergio\Documents\Peptides\propeptiq-labs-app` as the only application repository after Task 0. The worker-created `propeptiq-labs-site` is an incompatible Vinext/Cloudflare experiment and is not an implementation source.
- Read `AGENTS.md` and the relevant installed Next.js 16 documentation before editing application code.
- Preserve the user-authored `.codex`, `.superdesign`, and reference-design artifacts outside the application repository.
- Do not resume any remaining implementation task until `docs/design/superdesign-review.md` records user approval of an exact Superdesign draft version. Approval affects interface direction only and never opens a commerce launch gate.
- Never seed or display invented products, prices, purity, laboratories, certifications, COAs, inventory, testimonials, legal permissions, or provider approval.
- Synthetic entities are allowed only in test files and must be visibly labeled as test data.
- Use `server-only` boundaries for secrets, provider SDKs, authorization, and data access.
- Every permission, eligibility, jurisdiction, provider, and fulfillment decision fails closed.
- Never treat the browser, URL, hidden field, or success-page redirect as authoritative for price, payment, identity, state, or release.
- Record exact validation commands and evidence. A skipped or environment-blocked check is not a pass.

---

## Current execution hold

- [x] Binding business, architecture, security, payment, compliance, jurisdiction, deployment, testing, and runbook documentation is present.
- [x] Superdesign project `14bb848e-b774-4091-8f92-6a9cdf2b47ac`, desktop draft `d5bd0bcf-c086-499d-904c-4eb8581d2bb4`, version 3 was generated and audited for invented operating facts and researcher/organization scope.
- [x] The preserved scaffold/domain draft received a read-only pre-implementation review; its current failures and request-changes ruling are recorded in `docs/reviews/pre-implementation-review.md`.
- [ ] The user approves version 3 or requests a revision, and the decision is recorded in `docs/design/superdesign-review.md`.

Until the final checkbox is complete, all implementation tasks below remain paused. Existing uncommitted Task 2 work is preserved but is not accepted evidence of completion.

## Task 0: Establish the canonical repository and accept only reviewed artifacts

**Files:**

- Review: `propeptiq-labs-app/AGENTS.md`
- Review: `propeptiq-labs-app/package.json`
- Review: `propeptiq-labs-app/src/app/**`
- Review: `propeptiq-labs-app/src/lib/**`
- Create: `propeptiq-labs-app/.gitignore`
- Create: `propeptiq-labs-app/docs/**` from the approved root documentation
- Create: `propeptiq-labs-app/design-system/MASTER.md`
- Update: `propeptiq-labs-app/README.md`

- [x] Inventory both worker-created scaffolds and record which files are accepted, replaced, or discarded.
- [x] Verify the absolute path of `propeptiq-labs-site`, then quarantine that known worker-generated duplicate without touching `.codex`, `.superdesign`, `brand`, `design-system`, or root documentation.
- [x] Copy the approved product, architecture, ADR, compliance, security, deployment, testing, runbook, source, and design-system documents into the canonical repository.
- [x] Replace thin/conflicting scaffold documents with the approved versions.
- [x] Add ignore rules for `.env*` except `.env.example`, `node_modules`, `.next`, coverage, Playwright artifacts, local databases, editor files, and generated secrets.
- [x] Initialize Git in the canonical repository only; verify `git status --short` cannot stage credentials, dependencies, build output, or external reference artifacts.
- [x] Commit the plan-first baseline only after the repository contents match the approved documentation.

**Validation:**

```powershell
git status --short
git check-ignore .env.local node_modules .next
rg -n "propeptiq-labs-site|vinext|Cloudflare" README.md docs design-system
```

Expected: ADR 0001, the scaffold audit, traceability ledger, and this historical plan may mention why Vinext/Cloudflare was rejected; no runtime dependency or hosting instruction points to it.

## Task 1: Lock the current framework contract and quality toolchain

**Files:**

- Update: `package.json`
- Update: `package-lock.json`
- Update: `tsconfig.json`
- Update: `next.config.ts`
- Update: `eslint.config.mjs`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/env.ts`
- Create: `src/env.test.ts`

- [x] Read installed Next.js guides for project structure, server/client components, mutation/data security, route handlers, authentication, environment variables, metadata/OG, instrumentation, testing, production checklist, proxy, and view transitions.
- [x] Install exact direct dependencies for Clerk, Neon, Drizzle, Stripe, Blob, Resend, OpenTelemetry, Zod, server-only, Radix/shadcn primitives, and class composition; add focused test/dev dependencies.
- [x] Add scripts for the implemented toolchain: `lint`, `typecheck`, `test`, `test:watch`, `test:integration`, `test:e2e`, `build`, and `verify`.
- [x] Enable strict TypeScript and preserve Next.js generated settings.
- [x] Implement typed environment parsing with capability modes `disabled | test | live`; public-only builds require no provider secrets.
- [x] Make production reject live commerce unless explicit runtime mode and configuration are present; database launch gates will still be required later.
- [x] Write tests before implementation for public-only defaults, malformed values, incomplete test configuration, and incomplete live configuration.

**Validation:**

```powershell
npm run lint
npm run typecheck
npm test -- src/env.test.ts
npm run build
```

## Task 2: Build pure compliance, authorization, money, and order policies test-first

**Files:**

- Create: `src/domain/eligibility.ts`
- Create: `src/domain/eligibility.test.ts`
- Create: `src/domain/result.ts`
- Create: `src/domain/authorization.ts`
- Create: `src/domain/authorization.test.ts`
- Create: `src/domain/money.ts`
- Create: `src/domain/money.test.ts`
- Create: `src/domain/orders.ts`
- Create: `src/domain/orders.test.ts`
- Create: `src/domain/content-policy.ts`
- Create: `src/domain/content-policy.test.ts`
- Remove/replace after comparison: `src/lib/policy.ts`

- [ ] Define exact jurisdiction states `Allowed`, `Manual Review`, `Blocked`, and `Unknown`; represent non-jurisdiction gates with explicit pass/manual/block/unknown results.
- [ ] Implement deterministic aggregate precedence: any block denies; otherwise any unknown denies/routes review; otherwise any manual-review result holds; only all passes allow.
- [ ] Return structured reason codes and evidence references, never a bare boolean.
- [ ] Implement capability/resource authorization with organization scope and deny-by-default behavior.
- [ ] Implement integer-minor-unit price calculation with checked quantity, currency consistency, and immutable price snapshots.
- [ ] Implement explicit order/payment/compliance/fulfillment state transition functions; invalid transitions return typed errors and never mutate input.
- [ ] Implement prohibited-copy checks for dosage, administration, treatment, human/veterinary outcome, and unsupported-claim language as a publication defense-in-depth control.
- [ ] Close every issue in `docs/reviews/pre-implementation-review.md`, including explicit `human use`/`human consumption` adversarial copy, malformed persisted-enum handling, required strong-auth rows, verified dispute transitions, and atomic fulfillment-release consumption.
- [ ] Make price/tax/shipping inputs structurally distinct from browser request data and prove that only a server-resolved authoritative snapshot can reach the calculator.
- [ ] Use table/property-style tests to prove every missing/error path denies and every invalid transition fails.
- [ ] Follow the binding contracts and configurable-limit boundaries in `docs/architecture/domain-policies.md`; do not invent a currency, quantity limit, SKU rule, or approval.

**Validation:**

```powershell
npm test -- src/domain
npm run typecheck
```

## Task 3: Define the Neon/Drizzle data model and append-only database protections

**Files:**

- Create: `drizzle.config.ts`
- Create: `src/db/schema/*.ts`
- Create: `src/db/index.ts`
- Create: `src/db/migrations/0000_initial.sql`
- Create: `src/db/migrations/meta/**`
- Create: `src/db/migration-check.ts`
- Create: `src/db/migrate.ts`
- Create: `tests/integration/database.test.ts`
- Create: `tests/integration/helpers/database.ts`

- [ ] Model application principals, organizations, memberships, capabilities, researcher applications, attestations, evidence metadata, review decisions, products, categories, lots, private object metadata, jurisdictions, exact product-jurisdiction rules, prices, inventory ledger/reservations, eligibility snapshots/gates, holds, orders/items, provider events, payment journal/refunds, email outbox, fulfillment releases/shipments, audit events, and launch gates.
- [ ] Use stable opaque IDs, UTC timestamps, explicit status enums/checks, integer money, content/version hashes, and unique idempotency keys.
- [ ] Keep product/category/price/lot/permission tables empty in production migrations; seed only jurisdiction identity codes, never allow rules.
- [ ] Add constraints that prevent negative stock, duplicate event IDs, duplicate release consumption, cross-currency totals, and impossible parent relationships.
- [ ] Add database functions/triggers that reject update/delete on decision, payment-journal, inventory-ledger, fulfillment-release, and audit rows for the runtime role.
- [ ] Separate migration-owner and runtime-role grants.
- [ ] Add integration tests against an explicit isolated `TEST_DATABASE_URL`; tests must refuse a URL that appears production-scoped.
- [ ] Add `db:generate`, `db:check`, and guarded `db:migrate` scripts only with their real implementations; extend `verify` with the read-only migration check.

**Validation:**

```powershell
npm run db:generate
npm run db:check
npm run test:integration
```

## Task 4: Implement identity projection, centralized authorization, and tenant-safe DAL

**Files:**

- Create: `src/lib/server/auth/principal.ts`
- Create: `src/lib/server/auth/require-principal.ts`
- Create: `src/lib/server/auth/require-reverification.ts`
- Create: `src/lib/server/authorization/authorize.ts`
- Create: `src/lib/server/dal/*.ts`
- Create: `src/lib/server/dal/dal.test.ts`
- Create: `src/app/api/webhooks/clerk/route.ts`
- Create: `src/lib/server/auth/clerk-lifecycle.ts`
- Create: `src/lib/server/auth/clerk-reconciliation.ts`
- Create: `src/proxy.ts`
- Update: `src/app/layout.tsx`

- [ ] Project Clerk identity and active organization into a minimal immutable principal.
- [ ] Keep business approval, suspension, staff capabilities, and resource scope authoritative in Neon—not Clerk metadata.
- [ ] Require all production users to enroll MFA through Clerk configuration and require recent reverification for approvals, suspensions, catalog publication, jurisdiction publication, refunds, staff grants, and launch-gate changes.
- [ ] Use route protection only as a first layer; every server action/route/DAL method reauthorizes.
- [ ] Require organization ID in every organization-scoped DAL call and verify membership/capability inside the query/transaction.
- [ ] Ingest signed Clerk lifecycle webhooks through a recoverable unique inbox; project identity/membership changes without granting business approval, and immediately deny verified revocations.
- [ ] Add a reconciliation report for Clerk/Neon user, organization, invitation, and membership drift; inconsistencies deny rather than widen access.
- [ ] Add negative tests for anonymous, wrong-organization, suspended, insufficient-capability, and stale-reverification callers.

**Validation:**

```powershell
npm test -- src/lib/server/auth src/lib/server/authorization src/lib/server/dal
npm run typecheck
```

## Task 5: Deliver the compliance-safe public storefront and empty catalog behavior

**Files:**

- Update: `src/app/globals.css`
- Update: `src/app/layout.tsx`
- Update: `src/app/page.tsx`
- Create: `src/app/catalog/page.tsx`
- Create: `src/app/catalog/[slug]/page.tsx`
- Create: `src/app/research-use-policy/page.tsx`
- Create: `src/app/quality-records/page.tsx`
- Create: `src/app/access/page.tsx`
- Create: `src/components/site/**`
- Create: `src/components/ui/**`
- Create: `src/lib/server/dal/public-catalog.ts`
- Create: `src/lib/presentation/catalog.ts`
- Create: `src/app/catalog/catalog.test.tsx`
- Review: `docs/design/superdesign-review.md`
- Review: `design-system/MASTER.md`

- [ ] Confirm the Superdesign approval record names an exact approved draft version before editing any public UI file.
- [ ] Read the typography CSS/entity references before writing CSS and the shadcn instructions before composing UI primitives.
- [ ] Implement the approved off-white, ink, moss, Newsreader/Geist design system with CSS variables, semantic HTML, visible focus, AA contrast, responsive layout, and reduced-motion support.
- [ ] Build original components inspired by the references’ clinical clarity and category scanning, without copying assets, prose, product lists, or human-use framing.
- [ ] Render only approved public product/category/lot fields from the DAL; the initial catalog must show a polished, truthful empty state rather than sample merchandise.
- [ ] Product routes return not-found for missing/unpublished records and never reveal private COA object locations.
- [ ] Provide a truthful Quality Records explanation/lookup empty state; render lot/COA data only from approved public records.
- [ ] Keep cart/checkout entry unavailable to anonymous, unapproved, or catalog-empty users.
- [ ] Add component/accessibility tests for landmarks, headings, focus, no prohibited phrases, empty/error/loading states, and 375px overflow.

**Validation:**

```powershell
npm test -- src/app/catalog src/components/site
npm run lint
npm run typecheck
```

## Task 6: Implement researcher and organization application workflows

**Files:**

- Create: `src/app/(protected)/apply/**`
- Create: `src/app/(protected)/account/**`
- Create: `src/app/actions/applications.ts`
- Create: `src/lib/server/applications/service.ts`
- Create: `src/lib/server/storage/provider.ts`
- Create: `src/lib/server/storage/disabled.ts`
- Create: `src/lib/server/storage/vercel-blob.ts`
- Create: `src/lib/server/storage/storage.test.ts`

- [ ] Implement draft, submit, request-review, approve, reject, suspend, and expire transitions with immutable decision history.
- [ ] Persist the exact intended-use attestation text, version, actor, organization, and timestamp at submission.
- [ ] Collect only approved professional/research-purpose fields; warn and reject health/human-use information.
- [ ] Upload evidence only through private storage adapters with type/size allowlists, hash, retention class, and approval metadata; fail closed while scanning/review controls are unavailable.
- [ ] Prevent organization administrators from granting compliance approval.
- [ ] Expose applicants only to their own organization’s status and sanitized decision reasons.
- [ ] Test anonymous, cross-tenant, invalid-file, stale-attestation, suspension, and duplicate-submission paths.

**Validation:**

```powershell
npm test -- src/lib/server/applications src/lib/server/storage
npm run typecheck
```

## Task 7: Implement staff review, catalog, lot, jurisdiction, and launch-control consoles

**Files:**

- Create: `src/app/(staff)/admin/**`
- Create: `src/app/actions/admin/*.ts`
- Create: `src/lib/server/compliance/*.ts`
- Create: `src/lib/server/catalog/*.ts`
- Create: `src/lib/server/audit/*.ts`
- Create: `src/lib/server/compliance/compliance.test.ts`
- Create: `src/lib/server/catalog/catalog.test.ts`

- [ ] Build role-specific queues for applications, holds, draft catalog, lot evidence, missing/expiring jurisdiction rules, and closed launch gates.
- [ ] Require capability, resource scope, recent MFA/reverification, reason, evidence reference, and idempotency for every high-risk decision.
- [ ] Enforce two-person publication for catalog/jurisdiction changes; the drafter cannot be the approver.
- [ ] Prevent product publication unless identity fields, approved lot evidence, COA hash/linkage, price, inventory policy, and exact jurisdiction review requirements are complete.
- [ ] Keep the production launch gate closed without current accountable evidence for legal/catalog, provider, tax, shipping, fulfillment, security, and recovery domains.
- [ ] Append audit events with redacted metadata and correlation IDs; never allow application mutation of prior audit/decision rows.
- [ ] Test separation of duties, expired evidence, stale reauthentication, concurrent decision, and append-only behavior.

**Validation:**

```powershell
npm test -- src/lib/server/compliance src/lib/server/catalog src/lib/server/audit
npm run test:integration
```

## Task 8: Implement server-authoritative cart, eligibility, orders, and hosted-checkout creation

**Files:**

- Create: `src/app/(protected)/cart/**`
- Create: `src/app/(protected)/checkout/**`
- Create: `src/app/(protected)/orders/**`
- Create: `src/app/actions/checkout.ts`
- Create: `src/lib/server/eligibility/evaluate.ts`
- Create: `src/lib/server/orders/service.ts`
- Create: `src/lib/server/payments/provider.ts`
- Create: `src/lib/server/payments/disabled.ts`
- Create: `src/lib/server/payments/stripe.ts`
- Create: `src/lib/server/orders/orders.test.ts`
- Create: `src/lib/server/payments/payments.test.ts`

- [ ] Treat cart input as product ID and requested quantity only; reload approved product, current price, lot availability, buyer, organization, and destination on the server.
- [ ] Evaluate buyer, catalog, jurisdiction, provider, tax, shipping, inventory, compliance, and launch gates independently and persist a versioned snapshot.
- [ ] Any block denies; unknown or manual review creates/updates a hold and denies hosted checkout.
- [ ] An approved, unexpired exact-case manual-review decision may convert only its matching draft order and immutable eligibility-evaluation hash to pass; cart/quantity/destination/purpose/policy changes require a new evaluation and decision, and the base jurisdiction rule never changes.
- [ ] Require the current checkout attestation and persist its exact version.
- [ ] Create the order, price snapshot, reservation, and provider-session intent transactionally with an idempotency key.
- [ ] Use Stripe hosted Checkout only when adapter mode and database launch gate both permit it; pass server-derived amounts and correlation metadata.
- [ ] Keep the restricted Stripe operations client available for webhooks, retrieval, reconciliation, disputes, and refunds whenever validated provider credentials exist, even if new checkout is closed.
- [ ] Keep the disabled adapter as the safe default and show a truthful unavailable/hold state.
- [ ] Test browser-total tampering, stale price/policy, replay, concurrency, unknown jurisdiction, inventory race, and disabled/live-mode disagreements.

**Validation:**

```powershell
npm test -- src/lib/server/eligibility src/lib/server/orders src/lib/server/payments
npm run test:integration
```

## Task 9: Implement signed webhook processing, payment journal, fulfillment release, refunds, and reconciliation

**Files:**

- Create: `src/app/api/webhooks/stripe/route.ts`
- Create: `src/app/(protected)/orders/[id]/page.tsx`
- Create: `src/app/checkout/result/page.tsx`
- Create: `src/lib/server/payments/webhook.ts`
- Create: `src/lib/server/payments/refunds.ts`
- Create: `src/lib/server/payments/reconciliation.ts`
- Create: `src/lib/server/fulfillment/releases.ts`
- Create: `src/lib/server/email/provider.ts`
- Create: `src/lib/server/email/outbox.ts`
- Create: `src/lib/server/email/worker.ts`
- Create: `src/lib/server/email/resend.ts`
- Create: `src/lib/server/payments/webhook.test.ts`
- Create: `src/lib/server/fulfillment/releases.test.ts`

- [ ] Read the raw webhook body, verify the Stripe signature before parsing/trusting fields, and store unique provider event ID plus payload hash.
- [ ] Use recoverable inbox states and expiring leases: only processed/ignored same-hash duplicates are acknowledged; failed/stale events resume idempotently, and payload-hash conflicts reject/alert.
- [ ] Append payment journal entries and verify order, amount, currency, customer/provider metadata, and terminal status.
- [ ] Re-evaluate current eligibility after verified payment; adverse change produces `paid_on_hold` and no release.
- [ ] Mint a one-time fulfillment release only when verified payment and current clearance both exist; append revoke/expire/consume events, and recheck eligibility atomically so a revoked release cannot allocate or ship.
- [ ] Make the result/success page read-only; it fetches current order status and cannot alter payment or fulfillment.
- [ ] Implement partial/full refund request/confirmation/journal/reconciliation with capability, recent MFA, reason, refundable-balance validation, idempotency, and provider evidence.
- [ ] Use an email outbox plus lease/backoff/dead-letter worker so retried business transactions do not duplicate messages; disabled email is safe and observable.
- [ ] Test invalid signature, replay, out-of-order event, amount mismatch, paid-on-hold, duplicate email, refund replay, and consumed release.

**Validation:**

```powershell
npm test -- src/lib/server/payments src/lib/server/fulfillment src/lib/server/email
npm run test:integration
```

## Task 10: Add observability, rate limiting, secure headers, recovery checks, and operations surfaces

**Files:**

- Create: `src/instrumentation.ts`
- Create: `src/lib/server/observability/logger.ts`
- Create: `src/lib/server/observability/redaction.ts`
- Create: `src/lib/server/rate-limit/*.ts`
- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/readiness/route.ts`
- Create: `src/app/api/internal/outbox/route.ts`
- Create: `vercel.json`
- Update: `next.config.ts`
- Create: `scripts/verify-backup-config.mjs`
- Create: `scripts/reconcile-payments.mjs`
- Create: `src/lib/server/observability/observability.test.ts`

- [ ] Emit structured, correlated, redacted logs and OpenTelemetry spans without secrets, evidence content, payment payloads, addresses, or unnecessary PII.
- [ ] Add coarse Vercel Firewall documentation/config evidence and application mutation limits keyed by the narrowest safe actor/IP/org/resource combination.
- [ ] Configure CSP and security headers compatible with Clerk and hosted providers; document any allowed origin.
- [ ] Keep health public and shallow; readiness must not disclose dependencies or secrets and must fail when an enabled critical dependency is unavailable.
- [ ] Implement read-only operational scripts for payment reconciliation and backup configuration validation with explicit environment safeguards.
- [ ] Protect the scheduled outbox endpoint with a server secret; lease bounded batches, retry with exponential backoff, dead-letter exhausted messages, and alert without exposing recipient data.
- [ ] Test redaction, rate-limit fail-closed behavior, health/readiness disclosure, and unsafe-environment refusal.

**Validation:**

```powershell
npm test -- src/lib/server/observability src/lib/server/rate-limit
npm run build
node scripts/verify-backup-config.mjs
```

## Task 11: Add metadata, original social artwork, and restrained view transitions

**Files:**

- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/opengraph-image.tsx`
- Create: `src/app/twitter-image.tsx`
- Create: `src/components/navigation/view-transition-link.tsx`
- Update: `src/app/globals.css`
- Update: `next.config.ts`
- Create: `src/components/navigation/view-transition-link.test.tsx`

- [ ] Read the Satori limitations and view-transition implementation/CSS/Next.js guidance before editing.
- [ ] Generate original Satori imagery from text, simple gradients, and CSS-compatible shapes; use no competitor assets and no unsupported product/quality claims.
- [ ] Publish robots/sitemap entries only for real public routes; exclude protected/admin/order/private-document routes.
- [ ] Use the current supported Next.js view-transition approach only for subtle same-site navigation/progressive enhancement.
- [ ] Respect `prefers-reduced-motion`, preserve focus/history/scroll behavior, avoid transitioning sensitive user data, and keep navigation correct when the API is unavailable.
- [ ] Test metadata content, protected-route exclusion, reduced motion, and fallback navigation.

**Validation:**

```powershell
npm test -- src/components/navigation
npm run build
```

## Task 12: End-to-end verification, adversarial review, and deployment handoff

**Files:**

- Create: `tests/e2e/public.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/denial-paths.spec.ts`
- Create: `tests/e2e/applicant-flow.spec.ts`
- Create: `tests/e2e/reviewer-flow.spec.ts`
- Create: `docs/release/2026-08-24-readiness-report.md`
- Update: `README.md`
- Update: relevant runbooks and ADRs with implementation evidence

- [ ] Run the complete quality gate from a clean install and record exact versions, commands, exit codes, migration IDs, and any environment-blocked checks.
- [ ] Use synthetic isolated identities/data only; never trigger live payments, email, storage writes, notifications, or fulfillment.
- [ ] In Chrome, validate `/`, `/catalog`, `/research-use-policy`, `/access`, and all locally reachable denial/status paths at 1440, 768, and 375 widths.
- [ ] Compare the rendered public experience against the exact approved Superdesign version and record material deviations and their accessibility/compliance rationale.
- [ ] Verify keyboard-only navigation, visible focus, reduced motion, no horizontal overflow, readable empty/error states, and WCAG-oriented automated accessibility checks.
- [ ] Confirm product/catalog/price/COA tables remain empty unless the owner supplied and approved real records.
- [ ] Confirm payment mode remains disabled and no production launch gate is open without evidence.
- [ ] Run a skeptical code/security review and resolve every high/medium correctness finding before completion.
- [ ] Create a Vercel Preview only if an authenticated project is available and it can use isolated nonproduction resources; otherwise document the exact owner action without claiming deployment.
- [ ] Do not activate production commerce. Record legal/catalog/provider/tax/shipping/fulfillment/security/recovery owner actions as launch blockers.

**Final validation:**

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run db:check
npm run build
git diff --check
git status --short
```

Expected outcome: the public application and default-deny domain/payment architecture are demonstrably functional; unsupported commerce remains visibly and technically disabled; environment- or business-dependent production activation is reported as blocked rather than guessed.
