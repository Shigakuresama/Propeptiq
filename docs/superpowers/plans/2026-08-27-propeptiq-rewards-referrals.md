# PROPEPTIQ Design, Rewards, Referrals, and Affiliate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every task ends in an independently reviewable checkpoint.

**Goal:** Improve PROPEPTIQ's public and account experience while adding server-authoritative points, automatic customer referrals, neutral shared research sets, and a separately approved cash affiliate program.

**Architecture:** Preserve the completed lightweight-commerce architecture and add a bounded `growth` domain. Versioned database policies own every visible rate, threshold, attribution window, and program state. Immutable ledgers and idempotent lifecycle handlers own points and commissions. Public links carry opaque codes only; checkout reloads attribution, policy, balance, product, price, promotion, destination, and inventory facts on the server. Customer referrals are automatic for active buyers; cash affiliate approval and payout recording require an MFA-authenticated administrator.

**Tech Stack:** Next.js 16, React 19, strict TypeScript, Tailwind, shadcn/Radix, Clerk, Neon PostgreSQL, Drizzle, Stripe Checkout, Vitest, PGlite, Playwright, and Vercel.

**Spec:** [`docs/design/rewards-referrals-growth-experience.md`](../../design/rewards-referrals-growth-experience.md)

## Global constraints

- Continue in the canonical `propeptiq-labs-app` repository. Preserve the completed lightweight-commerce commits and the current header-logo fix.
- Do not inspect, copy from, build, or modify `_agent-quarantine/propeptiq-labs-site`.
- Preserve `desktop-v3`, `responsive-v2`, off-white/ink/moss, Newsreader/Geist, Proof Rail, research-use restriction bar, anonymous cart, lightweight buyer activation, and one-admin model.
- Competitor pages are research inputs only. Do not copy AminoClub assets, layout, copy, percentages, catalog facts, or claims into production data or fixtures.
- The owner-supplied PDF publication remains browse-only, price-free, and non-purchasable. Growth actions appear only for database-backed active commerce products.
- No visible rate, points balance, discount, commission, click count, urgency message, or program availability may be hard-coded as a production fact. It must come from one active versioned policy/read model.
- Keep the proposed V1 economics in the design spec as exact draft seed values for tests and admin-created policies. Production stays disabled until the owner approves unit economics and activates the records.
- Keep browser inputs non-authoritative. Server calculations own discounts, point conversion, point reservations, commissions, inventory, destination eligibility, tax, shipping, and provider requests.
- Preserve Stripe-hosted card collection, raw-body signature verification, event deduplication, payload-conflict detection, payment journaling, and read-only success pages.
- Human/veterinary outcomes, dosing, administration, reconstitution, treatment positioning, testimonials implying use, and unsupported analytical/quality claims remain prohibited.
- No purchased points, paid membership tiers, automatic bank payouts, lifetime commissions, device fingerprinting, or open-ended public bundle descriptions in V1.
- Every task starts with a clean status check, writes a failing test before implementation, runs focused validation, records `git diff --check`, and commits one reviewable checkpoint.

## File map

### Existing files to modify

- Design and requirements: `design-system/MASTER.md`, `docs/design/responsive-public-ui.md`, `docs/product-requirements.md`, `docs/architecture/data-model.md`, `docs/architecture/domain-policies.md`, `docs/architecture/authentication-authorization.md`, `docs/security/threat-model.md`, `docs/requirements-traceability.md`, `docs/testing.md`.
- Public shell: `src/lib/site-content.ts`, `src/components/site/site-header.tsx`, `src/components/site/site-footer.tsx`, `src/components/site/public-home.tsx`, `src/app/globals.css`.
- Commerce presentation: `src/components/commerce/catalog-listing-card.tsx`, `src/components/commerce/catalog-item-detail.tsx`, `src/components/commerce/cart-view.tsx`, `src/components/commerce/checkout-form.tsx`.
- Account/admin shells: `src/components/account/account-shell.tsx`, `src/admin/access.ts`, `src/admin/admin-read.ts`, `src/admin/admin-service.ts`, `src/admin/actions.ts`, `src/components/admin/resource-command-panel.tsx`.
- Domain and authorization: `src/domain/authorization.ts`, `src/domain/promotions.ts`, `src/domain/money.ts` and their tests.
- Checkout/lifecycle: `src/commerce/checkout-ports.ts`, `src/commerce/checkout-service.ts`, `src/commerce/provider-event-service.ts`, `src/commerce/refund-service.ts`, `src/commerce/fulfillment-service.ts`, `src/commerce/downstream-effect-worker.ts` and their tests.
- Database: `src/db/schema/enums.ts`, `src/db/schema/index.ts`, `src/db/repositories/checkout-repository.ts`, `src/db/repositories/provider-event-repository.ts`, `src/db/repositories/refund-fulfillment-repository.ts`, `src/db/repositories/admin-repository.ts`, `src/db/repositories/admin-read-repository.ts`.
- Browser coverage: `tests/e2e/public-storefront.spec.ts`, `tests/e2e/task5-account-admin.spec.ts`, `tests/e2e/task6-commerce.spec.ts`.

### New files to create

- Domain: `src/domain/rewards.ts`, `src/domain/rewards.test.ts`, `src/domain/referrals.ts`, `src/domain/referrals.test.ts`, `src/domain/affiliates.ts`, `src/domain/affiliates.test.ts`, `src/domain/shared-research-sets.ts`, `src/domain/shared-research-sets.test.ts`.
- Growth services: `src/growth/policies.ts`, `src/growth/read-model.ts`, `src/growth/rewards-service.ts`, `src/growth/referral-service.ts`, `src/growth/affiliate-service.ts`, `src/growth/shared-set-service.ts`, `src/growth/actions.ts`, `src/growth/attribution-cookie.ts` and focused tests beside each file.
- Growth storage: `src/db/schema/growth.ts`, `src/db/repositories/growth-repository.ts`, `src/db/repositories/growth-read-repository.ts` and tests.
- Public/account routes: `src/app/(public)/rewards/page.tsx`, `src/app/(public)/partners/page.tsx`, `src/app/(public)/rewards/terms/page.tsx`, `src/app/(public)/partners/terms/page.tsx`, `src/app/(public)/sets/[code]/page.tsx`, `src/app/account/rewards/page.tsx`, `src/app/account/referrals/page.tsx`, `src/app/account/partner/page.tsx`, `src/app/research-sets/page.tsx`, `src/app/r/[code]/route.ts`.
- Components: `src/components/growth/program-strip.tsx`, `src/components/growth/rewards-summary.tsx`, `src/components/growth/reward-ledger.tsx`, `src/components/growth/referral-dashboard.tsx`, `src/components/growth/affiliate-dashboard.tsx`, `src/components/growth/shared-set-builder.tsx`, `src/components/growth/shared-set-card.tsx` and focused component tests.
- Integration/browser tests: `tests/integration/growth-schema.test.ts`, `tests/integration/growth-repository.test.ts`, `tests/integration/growth-commerce-transactions.test.ts`, `tests/e2e/growth-experience.spec.ts`.
- Migration: the next Drizzle-generated SQL migration and snapshot under `src/db/migrations/`; never hand-edit the generated snapshot.

## Core interfaces

Implement and freeze these contracts before persistence or UI work:

```ts
type GrowthProgramStatus = "draft" | "active" | "retired";

type LoyaltyPolicy = Readonly<{
  id: string;
  version: number;
  status: GrowthProgramStatus;
  pointsPerDollar: number;
  redemptionMinorPerPoint: number;
  minimumRedemptionPoints: number;
  maximumRedemptionBasisPoints: number;
  expiresAfterDays: null;
  effectiveAt: string;
  supersededAt: string | null;
}>;

type ReferralPolicy = Readonly<{
  id: string;
  version: number;
  status: GrowthProgramStatus;
  attributionDays: 30;
  referredDiscountBasisPoints: number;
  referredDiscountCapMinor: number;
  referrerPointsPerDollar: number;
  referrerRewardCapPoints: number;
  effectiveAt: string;
  supersededAt: string | null;
}>;

type AffiliatePolicy = Readonly<{
  id: string;
  version: number;
  status: GrowthProgramStatus;
  attributionDays: 30;
  firstOrderCommissionBasisPoints: number;
  reorderCommissionBasisPoints: number;
  reorderWindowDays: number;
  approvalDelayDays: number;
  payoutThresholdMinor: number;
  currency: "USD";
  effectiveAt: string;
  supersededAt: string | null;
}>;

type RewardLedgerDelta = Readonly<{
  pendingPointsDelta: number;
  availablePointsDelta: number;
  kind:
    | "order_earned_pending"
    | "order_earned_available"
    | "referral_earned_pending"
    | "referral_earned_available"
    | "redemption_reserved"
    | "redemption_consumed"
    | "redemption_released"
    | "refund_reversal"
    | "chargeback_reversal"
    | "admin_adjustment";
  sourceId: string;
  idempotencyKey: string;
}>;

type AttributionEnvelopeV1 = Readonly<{
  schemaVersion: 1;
  program: "customer_referral" | "affiliate";
  code: string;
  issuedAt: string;
  expiresAt: string;
}>;
```

## Task 0: Freeze the design and competitor decisions

**Files:**

- Modify: `design-system/MASTER.md`
- Modify: `docs/design/responsive-public-ui.md`
- Modify: `docs/product-requirements.md`
- Modify: `docs/requirements-traceability.md`
- Reference: `docs/design/rewards-referrals-growth-experience.md`

- [ ] Record the new routes, information architecture, homepage module order, and the difference between browse-only PDF products and active commerce products.
- [ ] Record the V1 points, customer-referral, and affiliate policies exactly as proposed in the design spec, including that production records begin as `draft`.
- [ ] Record the explicit exclusions: purchased points, paid tiers, lifetime commission, automatic payouts, medical categories, fake popularity, and unsupported trust claims.
- [ ] Add a source note linking the five official AminoClub pages used for pattern research and state that they are not production data or legal precedent.
- [ ] Add traceability rows for public rewards, owner-only ledgers, automatic referral codes, affiliate approval, shared sets, lifecycle reversals, and responsive checks.
- [ ] Run `rg -n "buy points|lifetime commission|instant affiliate|medical category" design-system docs` and verify each occurrence is an explicit exclusion or competitor observation.
- [ ] Run `git diff --check` and commit `docs: define rewards referrals and affiliate experience`.

**Checkpoint:** The product and design contracts are reviewable without any runtime behavior changing.

## Task 1: Add domain policies test-first

**Files:**

- Create: `src/domain/rewards.ts`, `src/domain/rewards.test.ts`
- Create: `src/domain/referrals.ts`, `src/domain/referrals.test.ts`
- Create: `src/domain/affiliates.ts`, `src/domain/affiliates.test.ts`
- Create: `src/domain/shared-research-sets.ts`, `src/domain/shared-research-sets.test.ts`
- Modify: `src/domain/authorization.ts`, `src/domain/authorization.test.ts`
- Modify: `src/domain/promotions.ts`, `src/domain/promotions.test.ts`

- [ ] Write failing table tests for loyalty-policy validation: one active version, integer-safe rates, `100 points = $1`, 500-point minimum, 25% cap, no expiry, and USD-only redemption.
- [ ] Write failing calculation tests proving points use post-discount merchandise only, exclude tax/shipping, round down deterministically, and cannot overflow safe integer bounds.
- [ ] Write failing redemption tests for minimum, cap, insufficient available balance, negative balance, and zero/invalid requests.
- [ ] Write failing referral tests for 30-day last-eligible-click attribution, first-order-only benefit, self-referral denial, one referred buyer per policy, capped discount, capped reward, and inactive/expired code denial.
- [ ] Write failing affiliate tests for 10% first order, 5% reorders through day 180, no commission after the window, post-discount basis, refund reversal, payout threshold, and suspended partner denial.
- [ ] Write failing shared-set tests for 2–8 unique active product IDs, quantities 1–25, opaque code, neutral 120-character label, no free-form description, and inactive-product omission on public projection.
- [ ] Add `growth:manage` and `affiliate:payout` capabilities plus owner operations for reading rewards/referrals and applying to the partner program. Keep MFA for staff operations only.
- [ ] Implement the smallest pure functions that make the focused tests pass. Freeze returned arrays/objects and reject sparse arrays, unknown keys, non-finite values, and unsafe integers.
- [ ] Run `npm test -- --run src/domain/rewards.test.ts src/domain/referrals.test.ts src/domain/affiliates.test.ts src/domain/shared-research-sets.test.ts src/domain/authorization.test.ts src/domain/promotions.test.ts`.
- [ ] Run `npm run typecheck`, `git diff --check`, and commit `feat(growth): define rewards referral and affiliate policies`.

**Checkpoint:** All economics and eligibility rules are pure, deterministic, and independently reviewable before a database exists.

## Task 2: Add the versioned growth database model

**Files:**

- Create: `src/db/schema/growth.ts`
- Modify: `src/db/schema/enums.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/integration/growth-schema.test.ts`
- Create: next generated migration under `src/db/migrations/`

- [ ] Write failing PGlite schema tests for the tables and constraints below.
- [ ] Add versioned `loyalty_policies`, `referral_policies`, and `affiliate_policies`; enforce at most one active non-superseded version of each program.
- [ ] Add `reward_accounts` as a transactional balance projection and append-only `reward_ledger_entries` with unique idempotency keys, source references, signed pending/available deltas, and nonzero-delta checks.
- [ ] Add `reward_redemptions` tied to buyer, order, checkout attempt, policy version, points, USD amount, and `reserved | consumed | released` state. Enforce one active reservation per checkout attempt.
- [ ] Add `referral_codes`, `referral_attributions`, and `referral_conversions`. Enforce one active customer code per owner, globally unique opaque codes, one bound referral per referred buyer, one conversion per first order, and no owner/referred-user equality.
- [ ] Add `affiliate_profiles`, `affiliate_terms_acceptances`, `affiliate_attributions`, `affiliate_commissions`, and `affiliate_payouts`. Keep payout provider/reference nullable until an admin marks an externally completed payout paid.
- [ ] Add `shared_research_sets` and `shared_research_set_items`. Enforce unique public code, owner relation, product uniqueness, quantity bounds, and soft deactivation rather than hard deletion.
- [ ] Add `order_growth_attributions` to snapshot exactly one customer-referral or affiliate attribution and its policy version per order.
- [ ] Use foreign keys with `restrict` for financial/history records and `cascade` only for unqualified ephemeral records where deleting the parent is already impossible in production workflows.
- [ ] Generate the migration with Drizzle; run `npm run db:generate` a second time and require `No schema changes, nothing to migrate`.
- [ ] Run `npm run db:check` and `npm run test:integration -- --run tests/integration/growth-schema.test.ts`.
- [ ] Confirm the prior migration hashes are unchanged, run `git diff --check`, and commit `feat(db): add versioned growth ledgers and attribution`.

**Checkpoint:** The schema prevents duplicate balances, rewards, conversions, commissions, and payout consumption without production credentials.

## Task 3: Implement growth repositories and read models

**Files:**

- Create: `src/db/repositories/growth-repository.ts`
- Create: `src/db/repositories/growth-read-repository.ts`
- Create: `src/growth/policies.ts`
- Create: `src/growth/read-model.ts`
- Create: `tests/integration/growth-repository.test.ts`

- [ ] Write failing tests that load exactly one current policy at a fixed time and fail closed on zero, overlapping, malformed, future, or superseded active rows.
- [ ] Write failing transaction tests proving every ledger append and balance-projection update commit together; an injected ledger or projection failure rolls back both.
- [ ] Write failing idempotency tests for repeated provider events, shipment transitions, referral qualification, reversals, redemption reservation, and payout marking.
- [ ] Write failing owner-read tests proving a user can read only their reward account, ledger, referral summary, sets, affiliate profile, commissions, and payouts.
- [ ] Write failing privacy tests proving partner/referral read models never expose referred email, Clerk ID, shipping address, product lines, payment identifiers, raw IP, or raw cookie payload.
- [ ] Implement serializable repository methods with bounded retry using `src/db/serializable-retry.ts`.
- [ ] Return compact read models with available/pending points, USD equivalent, minimum-redemption progress, conversion counts, commission totals by state, and redacted references.
- [ ] Run `npm run test:integration -- --run tests/integration/growth-repository.test.ts`, `npm run typecheck`, and `git diff --check`.
- [ ] Commit `feat(growth): add transactional ledgers and private read models`.

**Checkpoint:** Persistence and owner privacy are proven independently of routes and UI.

## Task 4: Implement points and lifecycle accounting

**Files:**

- Create: `src/growth/rewards-service.ts`, `src/growth/rewards-service.test.ts`
- Modify: `src/commerce/checkout-ports.ts`, `src/commerce/checkout-service.ts`, `src/commerce/checkout-service.test.ts`
- Modify: `src/db/repositories/checkout-repository.ts`, `tests/integration/checkout-repository.test.ts`
- Modify: `src/commerce/provider-event-service.ts`, `src/commerce/provider-event-service.test.ts`
- Modify: `src/commerce/refund-service.ts`, `src/commerce/refund-service.test.ts`
- Modify: `src/commerce/fulfillment-service.ts`, `src/commerce/fulfillment-service.test.ts`
- Create: `tests/integration/growth-commerce-transactions.test.ts`

- [ ] Extend checkout contracts with only `rewardRedemptionPoints`; reject browser-provided conversion rates, balances, dollar values, earn amounts, or ledger identifiers.
- [ ] Write failing quote tests that reload the active policy and available balance, calculate the exact capped redemption server-side, and expose separate promotion/referral/points rows.
- [ ] Write failing concurrency tests proving two checkout attempts cannot reserve the same available points.
- [ ] Reserve points atomically with order preparation, consume once on verified payment, and release once on failed/expired/cancelled checkout. Replays must be no-ops with the same result.
- [ ] Append pending base earn on verified payment, move pending to available on delivery, and append proportional compensating entries on verified partial/full refund or chargeback.
- [ ] Keep points read-only on the success page. Refreshing or editing the URL cannot create or move points.
- [ ] Define behavior for a negative available balance after a reversal: the ledger remains readable, new redemption is denied, and future earns first offset the deficit.
- [ ] Run focused unit tests, `npm run test:integration -- --run tests/integration/checkout-repository.test.ts tests/integration/growth-commerce-transactions.test.ts`, and the three guarded PostgreSQL contention files only when the exact isolated-database guards exist.
- [ ] Run `git diff --check` and commit `feat(growth): account for points across checkout and fulfillment`.

**Checkpoint:** No browser or webhook replay can mint, double-spend, or duplicate points.

## Task 5: Implement referral attribution and shared research sets

**Files:**

- Create: `src/growth/attribution-cookie.ts`, `src/growth/attribution-cookie.test.ts`
- Create: `src/growth/referral-service.ts`, `src/growth/referral-service.test.ts`
- Create: `src/growth/shared-set-service.ts`, `src/growth/shared-set-service.test.ts`
- Create: `src/growth/actions.ts`, `src/growth/actions.test.ts`
- Create: `src/app/r/[code]/route.ts`, `src/app/r/[code]/route.test.ts`
- Create: `src/app/(public)/sets/[code]/page.tsx`
- Create: `src/app/research-sets/page.tsx`

- [ ] Write failing cookie tests for exact schema/version, HMAC signature, 30-day expiry, `HttpOnly`, `Secure` outside local, `SameSite=Lax`, no PII, and rejection of tampered, expired, wrong-environment, or unknown-program values.
- [ ] Make `/r/[code]` perform one bounded lookup, set the signed cookie only for an active code/policy, and redirect only to a fixed same-origin catalog path. Never accept a browser-supplied return URL.
- [ ] Automatically create one opaque customer referral code for an active buyer on first dashboard read or explicit activation action. Repeated calls return the same code.
- [ ] Bind attribution to a new buyer's first qualified order, reject self-referral, and snapshot the policy version. Do not expose the referring owner to the buyer.
- [ ] Calculate the referred-customer benefit alongside normal promotion eligibility; apply the greatest acquisition discount, not both.
- [ ] Create pending referral points on verified payment, make them available on delivery, and reverse them on refund/chargeback using event idempotency.
- [ ] Implement shared sets containing 2–8 unique active production product IDs and quantities only. Store a screened neutral label; do not store prices, claims, discount rates, inventory, or destination facts.
- [ ] Public set pages reload current products and omit inactive/missing items with a visible explanation. `Add set to cart` stores only current IDs/quantities.
- [ ] Add same-origin/CSRF checks and database-backed rate limits to code creation, set creation/update/deactivation, and copy/share analytics mutations.
- [ ] Run focused unit/route tests, `npm run test:integration -- --run tests/integration/growth-repository.test.ts tests/integration/growth-commerce-transactions.test.ts`, `npm run typecheck`, and `git diff --check`.
- [ ] Commit `feat(growth): add private referrals and shareable research sets`.

**Checkpoint:** A customer can share an opaque link without leaking identity or defining untrusted commerce facts.

## Task 6: Implement the cash affiliate workflow

**Files:**

- Create: `src/growth/affiliate-service.ts`, `src/growth/affiliate-service.test.ts`
- Modify: `src/growth/actions.ts`, `src/growth/actions.test.ts`
- Modify: `src/domain/authorization.ts`, `src/domain/authorization.test.ts`
- Modify: `src/commerce/provider-event-service.ts`, `src/commerce/provider-event-service.test.ts`
- Modify: `src/commerce/refund-service.ts`, `src/commerce/refund-service.test.ts`
- Modify: `src/commerce/fulfillment-service.ts`, `src/commerce/fulfillment-service.test.ts`

- [ ] Write failing application tests for verified email, bounded public channel URL/handle, promotion method enum, current terms acceptance, and duplicate idempotency. No document upload or organization requirement.
- [ ] Write failing admin decision tests for `pending → active | rejected`, `active → suspended`, exact expected version, one audit event, and rollback on stale or failed audit writes.
- [ ] Write failing commission tests for the exact draft policy, exclusive customer-referral/affiliate attribution, post-discount/points basis, pending on payment, approval eligibility 30 days after delivery, 180-day reorder cutoff, and proportional reversal.
- [ ] Write failing payout tests that total approved unpaid commission, enforce the $50 threshold, create one payout batch, and prevent marking paid without an external provider name/reference. Do not execute a bank or provider call.
- [ ] Require `growth:manage` + MFA for application decisions and suspension; require `affiliate:payout` + MFA for payout creation/paid recording. One administrator may hold both capabilities.
- [ ] Scan affiliate profile strings and any admin-authored partner copy through the existing content policy before public display.
- [ ] Append concise redacted `admin_audit` events for application decisions, suspension, policy activation, payout creation, and paid recording.
- [ ] Run focused tests, integration transaction tests, `npm run typecheck`, and `git diff --check`.
- [ ] Commit `feat(growth): add reviewed affiliate commissions and payout ledger`.

**Checkpoint:** Cash obligations are tracked and reversible without pretending the app sent money.

## Task 7: Build the public and account design improvements

**Files:**

- Modify: `src/lib/site-content.ts`
- Modify: `src/components/site/site-header.tsx`, `src/components/site/site-footer.tsx`, `src/components/site/public-home.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/commerce/catalog-listing-card.tsx`, `src/components/commerce/catalog-item-detail.tsx`, `src/components/commerce/cart-view.tsx`, `src/components/commerce/checkout-form.tsx`
- Modify: `src/components/account/account-shell.tsx`
- Create the routes and growth components listed in the file map.
- Create focused component tests beside each growth component.

- [ ] Write failing semantic/component tests for the new route headings, navigation links, inactive states, exact server-projected rates, ledger labels, progress semantics, copy-link status, and zero PII in partner/referral views.
- [ ] Refine the homepage hero scale and section rhythm while preserving the approved type/color system. Keep the catalog/evidence module visible earlier at 1440px.
- [ ] Add one restrained active-program strip; render nothing when no active promotion exists and never synthesize a countdown.
- [ ] Add labeled catalog search and exact source-name/code/unit filters without medical categories. Preserve all browse-only source rows and the price-free contract.
- [ ] Add `Earn N points` projections only to database-backed products with a real price and active policy.
- [ ] Add `Rewards` to public navigation and Rewards/Referrals/Partner to account navigation. Keep Partner Program in the footer instead of the primary desktop header.
- [ ] Build `/rewards`, `/partners`, account dashboards, shared-set builder, and public shared-set page with empty/loading/error/blocked/suspended/reversed states.
- [ ] Keep the mobile Sheet through 1024px. Protect the full logo image at 375px and 200% zoom; retain 44px targets and the cart/sign-in controls.
- [ ] Use text plus icon for all financial states. Move focus to mutation errors; announce successful copy/create actions via a polite status region.
- [ ] Run focused component tests and `npm test -- --run src/components/site src/components/commerce src/components/growth`.
- [ ] Run `git diff --check` and commit `feat(ui): add editorial rewards referrals and partner experience`.

**Checkpoint:** The entire growth experience is usable with fakes and inactive states before admin activation.

## Task 8: Extend one-admin management

**Files:**

- Modify: `src/admin/access.ts`, `src/admin/admin-read.ts`, `src/admin/admin-service.ts`, `src/admin/actions.ts`
- Modify: `src/db/repositories/admin-repository.ts`, `src/db/repositories/admin-read-repository.ts`
- Modify: `src/components/admin/resource-command-panel.tsx`
- Modify: `src/components/admin/admin-shell.tsx`
- Extend their existing tests.

- [ ] Add admin resources for growth policies, referral codes/conversions, affiliate applications, commissions, payouts, reward adjustments, and shared sets.
- [ ] Write failing authorization tests for non-admin, missing capability, missing MFA, blocked principal, stale expected version, and cross-resource command confusion.
- [ ] Build versioned policy create/activate/retire commands. Activation supersedes the prior version atomically and rejects overlapping effective windows.
- [ ] Keep proposed values as admin defaults only in local synthetic fixtures; production forms load current database values and require an explicit activate command.
- [ ] Add a bounded manual reward adjustment with required reason enum and audit event. Do not expose arbitrary free-form financial notes publicly.
- [ ] Add affiliate decision/suspension and payout-recording commands. Do not add a provider-send button.
- [ ] Add read-only redacted conversion/commission detail. No referred buyer identity, order lines, address, or provider identifiers.
- [ ] Require one audit event in the same transaction for every policy activation, adjustment, affiliate decision, suspension, payout state change, code revocation, and set deactivation.
- [ ] Run focused admin unit tests, `npm run test:integration -- --run tests/integration/growth-repository.test.ts tests/integration/task5-admin-repository.test.ts tests/integration/task5-admin-read-model.test.ts`, and `git diff --check`.
- [ ] Commit `feat(admin): manage growth programs with one mfa administrator`.

**Checkpoint:** One authorized administrator can operate V1 without dual approval, while financial/history mutations remain auditable and idempotent.

## Task 9: Complete security, terms, and adversarial content review

**Files:**

- Modify: `src/security/safeguards.test.ts`, `src/security/origin.ts`, `src/security/rate-limit.ts` only as tests require.
- Modify: `src/domain/content-policy.ts`, `src/domain/content-policy.test.ts` only for demonstrated gaps.
- Create: public terms pages from versioned server records.
- Modify: `docs/security/threat-model.md`, `docs/architecture/authentication-authorization.md`, `docs/architecture/domain-policies.md`.

- [ ] Add negative tests for tampered referral cookies, open redirects, cross-origin mutations, CSRF, code enumeration, high-velocity code/set creation, self-referral, duplicate accounts, replayed provider events, replayed shipment events, and payout double-consumption.
- [ ] Add production-artifact sentinels for synthetic policy values, fixed identities, local growth drivers, and test referral codes. Production builds must not contain them.
- [ ] Adversarially review every new public string for human/veterinary use, treatment/outcome implication, administration/dosing, unsupported quality statements, fake popularity, and fabricated savings/urgency.
- [ ] Verify terms acceptances use one current version and a server-computed SHA-256 hash. A mismatch rolls back the application or referral activation.
- [ ] Document retention: no raw IP/device fingerprint; attribution cookie expires at 30 days; conversion/financial ledgers follow order/accounting retention; redacted audit history remains append-only.
- [ ] Document abuse response: revoke code, suspend affiliate, freeze new rewards/redemptions, preserve owner reads, and reverse only from verified lifecycle facts.
- [ ] Run focused security/content tests, `npm run test:artifact-scanner`, `npm run verify:workspace-boundary`, and `git diff --check`.
- [ ] Commit `test(security): harden growth attribution and public claims`.

**Checkpoint:** The program remains low-friction for ordinary customers without becoming easy to forge, replay, or market through prohibited claims.

## Task 10: Browser verification and controlled release

**Files:**

- Create: `tests/e2e/growth-experience.spec.ts`
- Modify: `tests/e2e/public-storefront.spec.ts`, `tests/e2e/task5-account-admin.spec.ts`, `tests/e2e/task6-commerce.spec.ts`
- Modify: `docs/testing.md`, `docs/deployment/preview-readiness-and-handoff.md`, `docs/deployment/environments-and-recovery.md`

- [ ] Add deterministic local fixtures for one active loyalty policy, customer referral, affiliate application/status, shared set, point ledger, commission ledger, and reversal. Label every fixture `Synthetic local test only`.
- [ ] Prove public rewards values come from fixtures, referral landing sets only a signed cookie, cart survives sign-in, referral discount is authoritative, points reservation cannot double-spend, and success refresh cannot mint rewards.
- [ ] Prove active buyer automatic code creation, owner-only ledgers, blocked buyer read-only behavior, affiliate pending/active/suspended states, and no cross-user reads.
- [ ] Prove one capable MFA admin can activate a policy, decide an affiliate, create a payout batch, and record an external payout reference with audit read-back; non-admin/missing-MFA/missing-capability actors fail.
- [ ] Prove shared set links reload current facts, omit retired products, preserve only IDs/quantities in cart, and never carry price/claim data in the URL or local storage.
- [ ] Verify 375, 768, 1024, and 1440px, 200% zoom, keyboard focus, reduced motion, 44px targets, 16px explanatory text, progress semantics, narrow ledger reflow, and no overflow.
- [ ] Capture 375px and 1440px screenshots for homepage, catalog, rewards, referrals, partner dashboard, shared set, cart, and admin growth policy. Confirm the header logo image remains uncropped in the built preview.
- [ ] Run `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run lint`, fresh `npm run typecheck`, `npm run db:generate` twice, `npm run db:check`, `npm run build`, `npx next build --webpack`, artifact scans for both builds, `npm ls --omit=dev --depth=0`, `npm run verify:workspace-boundary`, and `git diff --check`.
- [ ] Run guarded real-PostgreSQL contention tests only when `TEST_DATABASE_URL` and exact `TEST_DATABASE_CONFIRMATION=isolated-test-database` are present. Otherwise record the lane as not run and make no real-concurrency claim.
- [ ] Deploy only to an isolated Preview with synthetic identities/data and all live capabilities disabled. Do not activate production growth policies until real commerce data, Stripe acceptance, destination policies, tax/shipping, fulfillment, terms review, unit economics, and payout operations are verified.
- [ ] Commit `test(e2e): verify growth experience and release gates`, request independent security/design review, and merge through the normal release process only after actionable findings are fixed.

**Checkpoint:** Code and preview are release-ready; production activation remains a separate explicit owner action.

## Acceptance scenarios

- A public visitor can understand the points/referral program without seeing invented rates when no active policy exists.
- An active buyer automatically receives one stable referral code without staff approval.
- A signed referral link contains no PII, expires after 30 days, and cannot redirect off-site.
- A referred new buyer receives the best eligible first-order acquisition discount; browser-supplied percentages are ignored.
- The referrer receives pending points exactly once, those points become available after delivery, and refunds/chargebacks append exact reversals.
- Points use post-discount merchandise only, exclude tax/shipping, and cannot be reserved by two checkouts at once.
- Reward and commission ledgers remain readable after buyer block or affiliate suspension, while new redemption/earning is denied as specified.
- A shared research set stores IDs/quantities only, reloads current server facts, and cannot publish dosing, outcomes, or fabricated combinations.
- An affiliate can apply with a verified email, channel, method, and terms acceptance without document uploads.
- One MFA administrator can approve/suspend an affiliate and record a payout; the app never claims to send money.
- Affiliate commission is private, bounded, post-discount, reversible, and cannot overlap customer-referral earnings on the same order.
- Browse-only PDF products remain price-free and contain no add-to-cart, points, referral, or affiliate earning claims.
- No synthetic policy, fixed identity, or local referral code appears in production artifacts.
- The 375px header logo remains uncropped and all new routes pass keyboard, reduced-motion, 200% zoom, and no-overflow checks.

## External activation inputs

- Owner approval of the proposed economics using actual gross margin, fulfillment, refund, chargeback, tax, and payout costs.
- Counsel review of customer rewards/referral terms, affiliate terms/disclosure language, payout/tax onboarding, real SKU claims, and state allowlist.
- Stripe acceptance of the actual business and live catalog.
- Real database-backed products, prices, lots, inventory, destination policies, tax/shipping, and fulfillment operation.
- A defined external method for paying affiliates and recording provider/reference evidence.
- Explicit production deployment and policy-activation authorization.
