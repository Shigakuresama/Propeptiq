# Cart identity and display-price truth implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (if subagents are available) or `superpowers:executing-plans`. Follow test-first RED/GREEN and commit only owned paths.

**Goal:** Make the browser cart retain exact product/variant identity and the same server-calculated display prices as catalog/product pages, while leaving checkout and payment authority closed.

**Architecture:** Add a pure server-side public-view-to-cart-source adapter. Refactor the current price-presentation helper narrowly so public cards and cart lines use the same pending/active/quantity/promotion calculation. Public inventory is explicitly unknown and can never authorize continuation. Preserve the exact local synthetic driver guard. Introduce an exact version-2 cart display DTO while leaving `SafeCartPreview`/`PRICE_CHANGED` checkout DTOs unchanged; update the cart UI and acceptance tests without changing checkout repositories or provider architecture.

**Tech stack:** Existing Next 16.3.2 App Router, React 19, TypeScript, Tailwind, Vitest/Testing Library, and Playwright. No additions.

**Spec:** [Approved Phase 2 contract](../specs/2026-09-03-cart-preview-truth.md).

**Baseline:** `17b1d8776feb6a069f52dbd420e4c3a7ebf410b6`; isolated worktree `propeptiq-main-integration`; branch `fix/propeptiq-cart-preview-truth`. The worktree was clean before this plan. Preserve the unrelated dirty sibling `feat/propeptiq-platform` worktree.

## Global constraints

- Reuse `getPublicStorefrontView`, `resolvePublicVariantPrice`, current cart normalization, current money utilities, and current checkout refusal paths. Do not create a second catalog or pricing source of truth.
- Client requests remain `{ items: [{ variantId, quantity }], previousPreviewToken }`. Reject or ignore any extra client facts; never trust a client price, promotion, total, inventory, Stripe ID, or availability claim.
- Public projection is display-only and forces checkout unavailable. The local synthetic fixture may be transaction-ready only behind its existing exact guard. Collisions fail closed.
- Use `apply_patch`, one implementation worker at a time, independent review after every task, and focused fix/re-review loops. Root owns this plan/spec and the ignored SDD ledger.
- Implementers own only listed paths and must stop before touching an extra file. They are not alone in the repository and must preserve other edits.
- Do not inspect/print secrets, modify Vercel/env/provider settings, apply migrations, call Stripe, or deploy during implementation tasks.

### Task 1: Shared price projection and cart preview model

**Files:**

- Create: `src/cart/storefront-preview-source.ts`
- Create: `src/cart/storefront-preview-source.test.ts`
- Modify: `src/catalog/storefront-price-presentation.ts`
- Modify: `src/catalog/storefront-price-presentation.test.ts`
- Modify: `src/cart/preview.ts`
- Modify: `src/cart/preview-types.ts`
- Modify: `src/cart/cart.test.ts`
- Modify if required by the source type only: `src/auth/local-driver-types.ts`, `src/auth/local-commerce-driver.ts`, `src/auth/local-commerce-driver.test.ts`
- Compatibility amendment: `src/app/api/catalog/preview/route.ts` and `.test.ts` only wrap the existing empty/local source in the required presentation mode; public hydration remains Task 2.
- Coherent DTO-boundary amendment: `src/cart/preview-presentation.ts` and `.test.ts` implement strict version-2 parsing/storage in Task 1, so the intermediate commit remains type-safe.
- Compatibility amendment: `src/components/commerce/cart-view.tsx` fallback DTO only; `cart-view.test.tsx` and `checkout-form.test.tsx` display-preview fixtures only. No UI redesign or checkout-safe fixture changes.
- Review repair: create `src/cart/preview-token.ts` and `.test.ts`; share canonical browser-safe SHA-256 between builder and parser and reject token mismatches.

**Implementation contract:** Extract or expose one narrow pure line-presentation primitive used by `resolvePublicVariantPrice` and cart preview. Add source presentation mode, nullable base amount, nullable available quantity, and checkout-readiness facts without exposing provider mappings. The public adapter filters active public promotions by product/variant scope and attaches only safe display metadata; it sets available quantity to null and treats all public rows as non-transactional. Canonical `variantLabel` is the exact variant label; `packageForm` is derived only from `packageQuantity` as `1 bottle` / `N bottles`, never from display-configuration position or label parsing. Build explicit purchase states and complete line price fields. Skip arithmetic for Production pending rows and every null pending amount. Tokenize all visible/status facts. Add `schemaVersion: 2` only to the display `CartPreview`; preserve `buildSafeCartPreview`, `SafeCartPreview`, and checkout-owned DTO behavior exactly.

- [ ] Add failing tests for exact 103-row projection, identity/label/SKU/derived-bottle facts, 40 positive / 63 pending split, scoped promotion labels, `availableQuantity: null`, no provider/inventory authority fields, frozen outputs/input preservation, collision rejection, and hostile/sparse runtime shapes where the boundary accepts `unknown`.
- [ ] Add RED pricing/model tests for quantities 1,2,3,4,9,10,11; 0/8/10/30 tiers; WINTER30 max-not-stack; overlaps; local zero versus production pending; explicit states; standard/effective/savings/subtotal; same/different variant identity; token changes on quantity/status/promotion/label change; unknown/unavailable/insufficient lines.
- [ ] Implement the smallest pure adapter/model refactor. `available` must equal `purchaseState === "ready"`; no public adapter row may become ready. Only a non-null authoritative available quantity may yield `insufficient_quantity`.
- [ ] Run focused tests, `npm run lint`, `npm run typecheck`, `npm run verify:workspace-boundary`, and `git diff --check`. Commit `fix(cart): project public variant price facts` and write the ignored task report.

### Task 2: Preview route, guarded source composition, and ADD policy

**Files:**

- Modify: `src/app/api/catalog/preview/route.ts`
- Modify: `src/app/api/catalog/preview/route.test.ts`
- Modify: `src/catalog/storefront-price-presentation.ts` and `.test.ts` only if Task 1 intentionally leaves the ADD-policy line for this task
- Modify focused consumers/tests only if a behavior assertion requires no production code change: `src/components/commerce/catalog-listing-card.test.tsx`, `src/components/commerce/product-purchase-panel.test.tsx`, `src/components/commerce/quick-add-variant-sheet.test.tsx`
- Modify boundary tests if already centralized: `src/components/commerce/client-boundary.test.ts`

**Implementation contract:** Load the public storefront view once per valid request and compose its display source with the synthetic source only under the existing exact local-commerce guard. Production and Preview receive public display facts. Invalid JSON/non-object remains the exact fixed no-store 400. Both typed projection/collision failure and unexpected loader failure return the exact fixed no-store 503 from the spec and never an identity-empty 200; exception details remain server-private. A missing-catalog-schema fallback already handled inside the public accessor remains a successful preview and must not be reimplemented in the route. Enable ADD for positive active preview-only variants in Production while retaining `checkout_unavailable`; pending/unavailable remain disabled there.

- [ ] Record RED for a real canonical Production/Preview variant currently returning unknown/null, exact single view load, synthetic local composition, collision, typed projection failure, unexpected-loader sanitization, handled missing-schema fallback, exact 400/503/200 cache headers, and no client/provider fields.
- [ ] Add focused ADD-policy tests proving positive active preview-only Production may enter browser cart, pending zero Production may not, local/test/Preview zero may, and available checkout-ready behavior is unchanged.
- [ ] Implement route dependency injection using the project's established factory/mock style. Do not add auth, DB, provider, or payment imports to client modules.
- [ ] Run route, public-server, price, affected component and boundary tests plus lint/typecheck/workspace/diff checks. Commit `fix(cart): hydrate previews from public catalog facts` and write the ignored task report.

### Task 3: Strict client presentation and cart experience

**Files:**

- Modify: `src/components/commerce/cart-view.tsx`
- Modify: `src/components/commerce/cart-view.test.tsx`
- Modify: `src/components/account/checkout-cart-status.tsx`
- Modify: `src/components/account/checkout-cart-status.test.tsx`
- Modify only for shared-preview compatibility: `src/components/commerce/checkout-form.tsx`, `src/components/commerce/checkout-form.test.tsx`
- Modify: `tests/e2e/public-storefront.spec.ts`
- Modify: `docs/runbooks/storefront-configuration.md`
- Modify: `docs/propeptiq-storefront-refactor-contract.md`

**Implementation contract:** Consume the strict version-2 parser/storage completed and reviewed in Task 1. Both `CartView` and `CheckoutCartStatus` must parse the shared response before rendering; they may not cast untrusted JSON. `CheckoutForm` may consume the parsed display DTO for status only, while its safe `PRICE_CHANGED` validator and quote/session request remain separate. Render product/variant/package/SKU, standard/sale price, savings/discount, promotion, subtotal, and precise status copy. Keep Continue disabled for all display-only lines and retain retry/facts-changed behavior. A parser defect discovered here must be reported for a narrowly authorized fix rather than silently broadening UI ownership.

- [ ] Re-run accepted parser/storage regressions for exact schema version/keys, bounds, holes/overridden iterators, duplicate variants/promotions, arithmetic inconsistency, state mismatch, token/reason mismatch, stale schema, and no partial acceptance. Add consumer-level failures for malformed responses; assert the checkout-safe DTO shape is unchanged and rejects display-only extensions where exact validation applies.
- [ ] Add RED component tests for priced preview-only, pending, unknown, unavailable, insufficient quantity, same/different variant lines, quantity refresh, loading/retry/stale preview, applied WINTER30, no misleading sold-out/checkout-calculation copy, live status, and disabled continuation.
- [ ] Add Playwright regressions at 320,375,768,1440 pixels. Use the existing real local catalog harness; prove TR30 quantity2 and TR60 quantity1 exact identities, 30% prices/savings/subtotals, disabled continuation/no checkout-provider request, keyboard quantity controls, safe focus, and no overflow. Preserve unique static test locations for the repository runner.
- [ ] Update the owner guide and refactor contract only for the public-cart display boundary, ADD policy, preview storage schema, and remaining checkout gates. Do not claim live inventory/payment readiness.
- [ ] Run focused parser/components/E2E, checkout refusal regressions, lint/typecheck/workspace/diff checks, and full unit once before commit. Commit `feat(cart): show exact variant preview pricing` and write the ignored task report.

## Phase 2 release gate

- [ ] Independent whole-diff spec/security/quality review; repair and re-review all actionable findings.
- [ ] Fresh unchanged-candidate checks: workspace boundary, artifact scanner, lint, Next type generation, typecheck, full unit, relevant PGlite integration, full E2E, Turbo and Webpack production builds/scans, and migration no-change evidence. Unrun or unavailable lanes are not passes.
- [ ] Open a narrowly scoped PR, inspect hosted checks and exact diff, merge under the owner's standing authorization only after green evidence, and verify the deployed catalog-to-cart flow on phone and desktop.
- [ ] Record exact merge/deployment/readback and rollback target. Do not mark the full storefront goal complete; continue later bounded phases.
