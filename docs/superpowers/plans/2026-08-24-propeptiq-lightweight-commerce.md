# PROPEPTIQ LABS Consolidation and Lightweight Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every task ends in an independently reviewable checkpoint.

**Goal:** Consolidate the duplicate efforts into one canonical application and replace the current compliance-heavy design with a low-friction research-only storefront using only materially necessary controls.

**Architecture:** Continue from the canonical Next.js repository. Public visitors may browse products, see prices, use promotions, and build a cart. Checkout requires a lightweight account, age confirmation, structured laboratory-purpose selection, and versioned research-use attestation. Product/destination allowlists, secure payments, truthful claims, inventory, and administrative blocks remain enforced server-side.

**Tech Stack:** Next.js 16, React 19, strict TypeScript, Tailwind, shadcn/Radix, Clerk, Neon PostgreSQL, Drizzle, Stripe Checkout, Vercel Blob, Resend, Vitest, Playwright, and Vercel.

**Spec:** Revise `docs/product-requirements.md` and supersede the existing strict implementation plan at `docs/superpowers/plans/2026-08-24-propeptiq-labs-platform.md` with this plan.

## Global Constraints

- Canonical codebase: `propeptiq-labs-app`, with the accepted checkpoint preserved on `feat/propeptiq-platform`.
- Preserve the approved desktop-v3 visual system and create a behavioral `responsive-v2` handoff for the public cart and lighter access flow.
- U.S.-only launch through a counsel-approved state allowlist; territories remain unavailable.
- Actual products, prices, lots, suppliers, and COAs must come from a real import manifest. Competitor data may appear only in test fixtures.
- Human/veterinary outcome claims, dosing, administration, reconstitution, and treatment positioning remain prohibited. FDA has established that research-use disclaimers do not cure surrounding human-use evidence. ([FDA warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025))
- Objective advertising claims must remain truthful and substantiated based on the advertisement's overall impression. ([FTC guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance))
- Stripe activation remains contingent on its review; Stripe expressly requires preventive measures preventing nonresearch buyers from accessing research peptides. ([Stripe guidance](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs))
- Preserve server-calculated prices, hosted card collection, signed webhook verification, idempotency, payment-event journaling, and read-only success pages.

## Current-State Diagnosis and Consolidation

| Task or folder | Confirmed role | Disposition |
|---|---|---|
| **Build PROPEPTIQ LABS website** (`01a03618-4ad5-7080-9cd7-65d242c2826b`) | Original task created first. It remained in reference-site, skill, vendor, and architecture planning in the workspace root. | Its useful research was absorbed; the duplicate task is archived. |
| **PROPEPTIQ canonical baseline checkpoint** (`01a0362a-4358-7c12-ab77-fb2d4382b35c`) | Later goal-continuation task reading the same objective plus strict full-stack requirements. It became the implementation controller and established the canonical Git repository. | Retained as the frozen canonical baseline checkpoint; replacement work continues on `feat/propeptiq-lightweight-commerce`. |
| `_agent-quarantine/propeptiq-labs-site` | Unsolicited worker scaffold later quarantined by the canonical task. It is not a Git repository, uses Vinext/Cloudflare-style tooling, contains placeholder webhooks and simplified static admin/checkout pages, and conflicts with the selected Vercel architecture. | Keep outside builds. Review only for isolated visual/copy ideas; do not merge its framework, policies, dependencies, or placeholder routes. Do not delete without separate approval. |

The two prior tasks were duplicate controllers created from essentially the same goal, not two intentionally separate peptide products. Both started from the same workspace root; the different folders were artifacts produced by competing workers.

## Interfaces and Policy Changes

- Replace pre-approved researcher accounts with:

  ```ts
  type BuyerStatus = "active" | "review" | "blocked";
  type ResearchPurpose =
    | "in_vitro"
    | "analytical"
    | "educational"
    | "other_laboratory";
  ```

  Clerk email verification plus age 21+, purpose selection, and attestation automatically creates an `active` buyer. No organization documents, identity documents, free-text application, or routine staff approval.

- Replace the nine evidence-heavy checkout gates with:

  ```ts
  type CheckoutGate =
    | "account"
    | "attestation"
    | "product"
    | "destination"
    | "inventory"
    | "payment_provider";

  type CheckoutDecision = {
    permitted: boolean;
    reviewRequired: boolean;
    reasons: readonly string[];
  };
  ```

- Resolve destinations using exact product/state override, then approved product-policy-group/state rule, then `unavailable`. Missing policy does not create a compliance case automatically.
- Keep manual review only when `buyer.status === "review"` or an explicit destination rule is `review`. No automated risk-scoring system or routine manual queue.
- Permit a single MFA-authenticated administrator to publish products, destination rules, promotions, and catalog copy. Remove two-person publication, evidence hashes, evidence expiration, separation-of-duties enforcement, and per-action reverification.
- Require a core product record, price, packaging/form, traceable inventory lot, policy group, and approved destination before activation. COAs and analytical evidence are optional unless the page makes purity, sterility, testing, laboratory, or accreditation claims.
- Permit truthful discounts, bundles, subscriptions, loyalty rewards, and cross-sells. All prices and discounts are recalculated server-side. Scarcity/countdown messaging may appear only when backed by real inventory or an actual promotion end time.
- Keep neutral scientific citations permissible, but separate them from purchase CTAs and do not convert them into seller-authored human outcome, efficacy, or usage claims.

## Implementation Tasks

### Task 0: Stop Duplication and Establish the New Baseline

- [ ] Wait for **PROPEPTIQ canonical baseline checkpoint** to finish its current atomic work; require every dirty file under `src/db`, `src/components`, tests, and package files to be committed or explicitly handed off.
- [ ] Preserve its current branch and commits; do not overwrite or discard in-progress Task 3/UI work.
- [ ] Archive **Build PROPEPTIQ LABS website** after recording that its research was absorbed.
- [ ] Create an isolated `feat/propeptiq-lightweight-commerce` worktree from the latest accepted canonical checkpoint.
- [ ] Record `_agent-quarantine/propeptiq-labs-site` as non-authoritative and excluded from search, build, lint, and test scopes.

**Validation:** Clean canonical status, one active owner, quarantine absent from package/workspace configuration.

### Task 1: Replace the Strict Specification

- [ ] Rewrite the product requirements, catalog policy, jurisdiction policy, authorization model, data-model documentation, and runbooks around the lightweight decisions above.
- [ ] Supersede the old plan rather than editing its strict tasks piecemeal.
- [ ] Record `responsive-v2`: retain desktop-v3 styling while allowing public catalog, prices, promotions, and anonymous cart access.
- [ ] Change “verified researcher approval” language to “research-use account and checkout attestation.”
- [ ] Remove blanket bans on promotions, subscriptions, bundles, and cross-sells.
- [ ] Clearly label legal review, real catalog data, destination allowlist, tax configuration, fulfillment operation, and payment-provider acceptance as external launch inputs—not elaborate application workflows.

**Validation:** Repository search finds no binding requirement for pre-approval, document upload, two-person publication, per-action reverification, or a complete 50-state matrix.

### Task 2: Simplify Domain Policies Test-First

**Primary files:** `src/domain/eligibility.ts`, `authorization.ts`, `content-policy.ts`, `orders.ts`, and their tests.

- [ ] Write failing tests for automatic buyer activation, lightweight checkout, policy-group destination resolution, normal promotions, optional COAs, and single-admin publication.
- [ ] Replace `REQUIRED_GATE_KEYS` and the current evidence-heavy jurisdiction types with the new interfaces.
- [ ] Remove exact-case evaluation hashes, evidence-integrity requirements, expiry machinery, and automatic hold creation from routine checkout.
- [ ] Require MFA only for staff administration, refunds, and fulfillment actions; customer account and order operations require authentication but not MFA.
- [ ] Change content validation so the site-level research restriction is rendered by layout/product templates rather than required inside every copy candidate.
- [ ] Preserve the existing money calculations and payment/fulfillment state integrity.

**Validation:** Domain tests demonstrate that ordinary qualified customers pass without staff action while blocked accounts, unavailable destinations, inactive products, and human-use content still fail.

### Task 3: Implement the Lean Database Model

- [ ] Model `users`, `buyer_profiles`, `attestations`, `staff_roles`, `product_policy_groups`, `products`, `lots`, optional `coa_documents`, `destination_policies`, `promotions`, `orders`, `order_items`, `provider_events`, `payment_events`, `inventory_events`, `review_requests`, `shipments`, and `admin_audit`.
- [ ] Omit v1 organization tenancy, membership projection, evidence-document applications, publication approval chains, jurisdiction evidence hashes, launch-gate tables, and database-level separation-of-duty triggers.
- [ ] Resolve destination policy as exact product override → policy group → unavailable.
- [ ] Retain uniqueness/idempotency constraints for payment events, refunds, inventory consumption, and shipment/release consumption.
- [ ] Add guarded migrations and integration tests against an isolated test database.

**Validation:** `db:generate`, `db:check`, and database integration tests pass without production credentials.

### Task 4: Build the Public Storefront and Demo Catalog

- [ ] Implement `/`, `/catalog`, `/catalog/[slug]`, `/cart`, `/research-use`, and `/quality-records` using the approved off-white/ink/moss, Newsreader/Geist system and Proof Rail.
- [ ] Add a development/test catalog adapter containing clearly labeled fixtures; `CATALOG_DEMO_MODE` must hard-fail in production.
- [ ] Keep production catalog data empty until a real manifest is imported.
- [ ] Allow anonymous visitors to view approved products, prices, promotions, and add product IDs/quantities to a local cart.
- [ ] Preserve the cart through Clerk sign-in; never trust locally stored price, discount, inventory, or eligibility data.
- [ ] Implement discounts, bundles, subscriptions, loyalty display, and related-product recommendations from server records.
- [ ] Render COA/testing claims only when the active lot contains the corresponding evidence.

**Validation:** Anonymous browsing/cart works; demo data is visibly marked and impossible to enable in production; mobile and 200% zoom checks pass.

### Task 5: Implement Lightweight Accounts and Administration

- [ ] At checkout, require Clerk email verification, age confirmation, purpose selector, and the current attestation version.
- [ ] Automatically activate the buyer after successful completion.
- [ ] Build customer account/order history without organization application workflows.
- [ ] Build one-admin CRUD for products, lots, COAs, policy groups, destination rules, promotions, buyer status, review requests, orders, refunds, and shipments.
- [ ] Require Clerk MFA for staff routes but remove per-action reauthentication and dual approval.
- [ ] Append concise audit events for catalog publication, destination changes, buyer blocks/reviews, refunds, and shipment actions.

**Validation:** A new customer can become checkout-eligible without staff intervention; blocked/review accounts cannot bypass their status; non-admin users cannot access staff routes.

### Task 6: Implement Checkout, Payments, and Fulfillment

- [ ] Accept only product IDs, quantities, destination, and promotion identifiers from the browser.
- [ ] Reload product, price, discount, inventory, account, attestation, destination, shipping, and provider status on the server.
- [ ] Create Stripe Checkout only when the actual Stripe account and catalog are approved and enabled.
- [ ] Verify webhook signatures from the raw body, deduplicate provider events, journal payment changes, and reject payload-hash conflicts.
- [ ] Keep the return/success page read-only.
- [ ] Before shipping, confirm verified payment, no active order/buyer hold, sufficient inventory, and that the product/destination remains allowed.
- [ ] Place an already-paid order on hold only when one of those facts changed; do not rerun the former nine-gate compliance workflow.

**Validation:** Browser price tampering fails, promotion totals remain authoritative, webhook replay is idempotent, and success-page refresh cannot mark an order paid.

### Task 7: Final Verification and Controlled Handoff

- [ ] Run lint, strict TypeScript, all unit/integration/browser tests, production build, dependency audit, and `git diff --check`.
- [ ] Test 375px, 768px, 1024px, 1440px, keyboard navigation, reduced motion, and 200% zoom.
- [ ] Perform an adversarial content review for implied human-use positioning, misleading quality claims, and promotion accuracy.
- [ ] Prepare a preview for synthetic accounts, Stripe test mode, and a clearly marked demo catalog. Preview publication is a separate external side effect and requires explicit approval at action time.
- [ ] Keep production commerce disabled only until real SKU manifest, destination allowlist, tax/shipping configuration, fulfillment process, and provider approval are supplied and verified.
- [ ] After verification, complete branch review and prepare the normal release handoff. Merge and production activation remain separate explicit actions.

## Acceptance Scenarios

- Anonymous visitors can browse, see real approved prices, and create a cart.
- Checkout redirects anonymous visitors to sign in without losing the cart.
- Email verification + age 21+ + purpose selection + attestation activates an ordinary account automatically.
- Missing or blocked destination policy prevents checkout without creating an unnecessary compliance case.
- Explicit `review` status creates one review request; approval applies only to that buyer/cart snapshot.
- Product-level destination rules override policy-group rules.
- Testing/purity/sterility claims cannot publish without matching lot evidence; ordinary merchandising claims do not require COAs.
- Promotions, bundles, subscriptions, loyalty, and cross-sells work without introducing human-use claims.
- Test fixtures cannot appear in a production build or production database.
- Browser totals cannot alter charges.
- Duplicate Stripe events cannot duplicate payment, inventory, email, refund, or shipment effects.
- A paid order cannot ship after an account, product, or destination becomes blocked.
- One MFA-authenticated admin can publish approved records with an audit event; no second approver is required.

## Assumptions and Defaults

- The selected model is public catalog + public cart + account required only at checkout.
- Initial catalog implementation uses test-only fixtures; no competitor product becomes a PROPEPTIQ production SKU.
- Launch uses an approved state allowlist and expands incrementally.
- Individuals may enter an optional organization name, but organization tenancy and membership administration are out of v1.
- Normal commerce merchandising is allowed after the associated product and promotion records are active.
- Stripe is the first payment adapter, but live processing is not assumed until Stripe approves the actual business.
- Qualified counsel must review the real SKU/policy-group/state allowlist. The application will not attempt to encode an unproven universal definition of “legally allowed.”
