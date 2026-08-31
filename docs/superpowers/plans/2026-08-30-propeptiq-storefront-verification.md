# PROPEPTIQ Storefront Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add progressive reduced-motion-safe reveal behavior and prove the completed storefront’s pricing, security, accessibility, responsive layout, search, content, image stability, and production gates before handoff.

**Architecture:** Keep motion as a tiny progressive enhancement over content that is visible by default, then extend the existing unit/component/integration/Playwright suites with a traceable acceptance matrix. The final gate reports only commands actually executed and preserves browse-only production status while required business inputs remain missing.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, IntersectionObserver, Vitest/Testing Library, Axe, Playwright, Next.js production build

**Spec:** `docs/propeptiq-storefront-refactor-contract.md`

## Global Constraints

- Execute this plan only after the commerce, catalog/product, search, and public-content plans pass their phase gates.
- Essential content is visible without JavaScript; motion never controls layout, access, or reading order.
- Use opacity and short vertical movement only; no autoplay, parallax, long delay, or image dimension change.
- `prefers-reduced-motion: reduce` disables reveal animation, smooth scrolling, carousel motion, and nonessential transitions.
- Verification covers 375, 768, 1024, and 1440 CSS-pixel widths plus 200% zoom and a short `390×520` viewport.
- Production remains browse-only while prices, variants, inventory, Stripe mappings/approval, legal copy, privacy/newsletter, or calculator approval are incomplete.
- Never report a skipped, guarded, interrupted, or unobserved command as passed.
- Local verification/task commits are authorized for this execution. Do not merge, deploy, or change external production state without separate explicit authorization.

---

## File structure

### Create

- `src/components/site/reveal.tsx` and `.test.tsx`
- `tests/e2e/storefront-commerce-ui.spec.ts`
- `tests/e2e/storefront-search-content.spec.ts`
- `docs/deployment/storefront-refactor-handoff.md`

### Modify

- `src/app/globals.css`
- `src/components/site/public-home.tsx`
- `src/components/commerce/catalog-explorer.tsx`
- `src/components/commerce/catalog-item-detail.tsx`
- `tests/e2e/public-storefront.spec.ts`
- `docs/testing.md`
- `docs/requirements-traceability.md`
- `docs/runbooks/storefront-configuration.md`

## Task 1: Progressive scroll reveal with no-JavaScript and reduced-motion safety

**Files:**

- Create: `src/components/site/reveal.tsx`
- Create: `src/components/site/reveal.test.tsx`
- Modify: `src/app/globals.css`
- Modify: public section components

**Interfaces:**

- Consumes: existing motion tokens and browser `IntersectionObserver`
- Produces: `<Reveal>` wrapper that never hides content by default

- [ ] **Step 1: Write failing progressive-enhancement tests**

```tsx
it("renders content visible before effects run", () => {
  render(<Reveal><section>Essential content</section></Reveal>);
  const wrapper = screen.getByText("Essential content").parentElement;
  expect(wrapper).not.toHaveAttribute("hidden");
  expect(wrapper).not.toHaveAttribute("aria-hidden");
  expect(wrapper).not.toHaveAttribute("data-reveal-entered");
});

it("marks entry once and disconnects the observer", () => {
  render(<Reveal><section>Essential content</section></Reveal>);
  intersectionCallback([{ isIntersecting: true, target: screen.getByText("Essential content").parentElement! }]);
  expect(screen.getByText("Essential content").parentElement).toHaveAttribute("data-reveal-entered", "true");
  expect(disconnect).toHaveBeenCalled();
});
```

Assert the component performs no observation when `matchMedia("(prefers-reduced-motion: reduce)")` matches or IntersectionObserver is unavailable.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/components/site/reveal.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement visible-by-default entry animation**

```tsx
export function Reveal({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || !globalThis.IntersectionObserver || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setEntered(true);
      observer.disconnect();
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={className} data-reveal-entered={entered || undefined}>{children}</div>;
}
```

Keep the default style fully visible. Apply a short keyframe only when `data-reveal-entered="true"`; because the element is below the viewport before intersection, the animation does not block or shift content. In the reduced-motion query, set animation/transition duration to effectively zero and `transform: none`.

- [ ] **Step 4: Run motion and component regressions**

Run: `npm test -- src/components/site/reveal.test.tsx src/components/site/public-home.test.tsx src/components/commerce/catalog-explorer.test.tsx src/components/commerce/catalog-item-detail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/site/reveal.tsx src/components/site/reveal.test.tsx src/app/globals.css src/components/site/public-home.tsx src/components/commerce/catalog-explorer.tsx src/components/commerce/catalog-item-detail.tsx
git commit -m "feat(motion): add progressive storefront reveals"
```

## Task 2: Acceptance-matrix unit, component, route, and integration coverage

**Files:**

- Modify: focused tests introduced by the preceding plans
- Modify: `docs/requirements-traceability.md`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes: all completed storefront contracts
- Produces: one traceable automated assertion for every non-browser acceptance rule

- [ ] **Step 1: Create a traceability table before changing tests**

Add storefront requirement IDs and exact evidence locations for:

- `STO-PRICE-01`: quantities 1, 2, 3, 4, 9, 10, 11 and 0/8/10/30%;
- `STO-PRICE-02`: same-variant merge and separate-variant isolation;
- `STO-PROMO-01`: active/inactive/scheduled/expired/targeted/overlapping WINTER30 and no stacking;
- `STO-CHECKOUT-01`: client amount/discount/Stripe/promotion tampering, mixed currency, stale revision, and `$0` rejection;
- `STO-SEARCH-01`: normalization, fuzzy floor, sorting, stable ties, no results, approved-only index;
- `STO-UI-01`: required variant choice, announced dynamic price, related quick add, FAQ, newsletter failure, calculator gate;
- `STO-A11Y-01`: focus, keyboard, live status, reduced motion, image dimensions, and responsive layout.

- [ ] **Step 2: Run the exact focused suites and record any missing assertion as a failure**

```powershell
npm test -- src/domain/storefront-pricing.test.ts src/cart/cart.test.ts src/domain/checkout.test.ts src/commerce/checkout-service.test.ts src/commerce/provider-contracts.test.ts src/search/storefront-search.test.ts src/search/storefront-index.test.ts src/components/commerce/product-purchase-panel.test.tsx src/components/commerce/related-products-carousel.test.tsx src/components/search/site-search-sheet.test.tsx src/components/site/faq-section.test.tsx src/newsletter/server.test.ts src/components/site/newsletter-form.test.tsx src/domain/concentration.test.ts src/components/site/reveal.test.tsx
```

Expected: PASS only if each matrix row has an explicit assertion. If a row lacks coverage, stop the gate, add the exact focused test beside its implementation, rerun it failing once, implement the correction, and rerun to PASS.

- [ ] **Step 3: Run HTTP, repository, and security paths**

```powershell
npm test -- src/app/api/checkout/quote/route.test.ts src/app/api/checkout/sessions/route.test.ts src/app/api/storefront-search/route.test.ts src/app/api/newsletter/route.test.ts src/commerce/stripe-webhook-verifier.test.ts src/commerce/provider-event-service.test.ts
npm run test:integration
```

Expected: PASS. Verify the unconfigured newsletter path emits no email, checkout hostile fields are rejected, stale prices create no session, and existing webhook/order/inventory behavior remains green.

- [ ] **Step 4: Run the guarded PostgreSQL lane only when exact guards exist**

Run: `npm run test:postgres:checkout`

Expected with `TEST_DATABASE_URL` and exact `TEST_DATABASE_CONFIRMATION=isolated-test-database`: PASS. Without both: do not run and report `NOT RUN — isolated PostgreSQL guards absent`.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add docs/requirements-traceability.md docs/testing.md src tests
git commit -m "test(storefront): cover commerce acceptance matrix"
```

## Task 3: Keyboard, focus, responsive, and reduced-motion browser coverage

**Files:**

- Create: `tests/e2e/storefront-commerce-ui.spec.ts`
- Create: `tests/e2e/storefront-search-content.spec.ts`
- Modify: `tests/e2e/public-storefront.spec.ts`

**Interfaces:**

- Consumes: synthetic/local test-driver storefront fixtures only
- Produces: browser evidence for the complete public flow without live provider writes

- [ ] **Step 1: Add failing commerce-flow browser tests**

Use approved synthetic test fixtures to select two variants, add the same variant repeatedly, verify merged quantity/tier, verify another variant remains separate, and confirm pending `$0` lines expose `Pricing coming soon` and never navigate to a hosted payment session.

Exercise quantity presets 1/2/3/10, manual values 4/9/11, minus/plus controls, variant changes, related-product quick add, cart confirmation, FAQ disclosure, newsletter invalid/unconfigured states, and calculator absence under the default gate.

- [ ] **Step 2: Add failing search/focus browser tests**

Open catalog search and bottom search using keyboard only. Assert query persists across sorting, typo result, no-result/clear, Product and Pages or Information groups, Arrow Down/Up, Enter navigation, Tab focus loop, Escape close, and focus restoration to the launcher. Run Axe with the Sheet open.

- [ ] **Step 3: Add failing viewport and 200% zoom tests**

For 375, 768, 1024, and 1440 widths, assert no `scrollWidth > clientWidth`, all interactive targets are at least 44×44 CSS pixels, price/selection states have visible text, product grids/carousels remain usable, and the bottom launcher does not overlap the last public control. At 200% zoom, assert no clipped text or unreachable controls.

At `390×520`, focus the bottom-search input and assert its first result/close control remain visible. Emulate safe-area CSS values through the existing test harness and assert reserved bottom spacing.

- [ ] **Step 4: Add reduced-motion assertions**

Emulate `reducedMotion: "reduce"`; assert reveal elements remain visible, computed animation/transition durations are effectively zero, carousel navigation is not smooth, and no content depends on animation completion.

- [ ] **Step 5: Run focused browser files**

```powershell
npx playwright test tests/e2e/storefront-commerce-ui.spec.ts tests/e2e/storefront-search-content.spec.ts tests/e2e/public-storefront.spec.ts
```

Expected: PASS with the local test driver; no external Stripe, email, or production service is called.

- [ ] **Step 6: Review traces/screenshots and authorized commit**

Inspect failure artifacts even on a green retry, confirm no intermittent focus or hydration issue was masked, then:

```powershell
git add tests/e2e/storefront-commerce-ui.spec.ts tests/e2e/storefront-search-content.spec.ts tests/e2e/public-storefront.spec.ts
git commit -m "test(storefront): verify responsive keyboard flow"
```

## Task 4: Image stability and performance boundaries

**Files:**

- Modify: `tests/e2e/public-storefront.spec.ts`
- Modify: `src/app/globals.css` only if a failing test proves a layout issue
- Modify: product/card/carousel components only if a failing test proves duplicate loading or missing dimensions

**Interfaces:**

- Consumes: existing next/image optimization and shared server projections
- Produces: reproducible no-material-shift and no-duplicate-catalog evidence

- [ ] **Step 1: Add delayed-image layout tests**

Intercept local `/catalog/*.webp` responses, delay them, capture card and carousel item bounding boxes before release, release images, wait for decode, and assert x/y/width/height remain unchanged within one CSS pixel. Assert every product image has a reserved aspect-ratio container and below-fold images are lazy.

- [ ] **Step 2: Add index/catalog request-count assertions**

On a normal public page, assert the bottom search index is not requested before opening. Open it twice and assert one successful index request. Navigate to catalog and assert the canonical product projection is not fetched again by a second client-only service.

- [ ] **Step 3: Run focused performance-boundary browser tests**

Run: `npx playwright test tests/e2e/public-storefront.spec.ts --grep "image stability|lazy search index|catalog projection"`

Expected: PASS. If a bound fails, make the smallest image-dimension, memoization, or lazy-loading correction and rerun the failing case before the file.

- [ ] **Step 4: Run production build and inspect warnings**

Run: `npm run build`

Expected: PASS with no new dynamic-route, hydration, image-size, or client-bundle warning. Record build output rather than inferring bundle improvement.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add tests/e2e/public-storefront.spec.ts src/app/globals.css src/components src/catalog
git commit -m "test(storefront): guard image and search loading stability"
```

## Task 5: Full release gate and honest owner handoff

**Files:**

- Create: `docs/deployment/storefront-refactor-handoff.md`
- Modify: `docs/runbooks/storefront-configuration.md`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes: all phase results and actual command outputs
- Produces: exact pass/fail/not-run record and business launch-blocker list

- [ ] **Step 1: Verify the final diff scope before running gates**

Run:

```powershell
git status --short --branch
git diff --stat
git diff --check
```

Expected: only planned storefront/docs/tests/migration files are changed; unrelated eight local commits and sibling-worktree changes remain untouched; `git diff --check` passes.

- [ ] **Step 2: Run the complete repository gate sequentially**

```powershell
npm run verify:workspace-boundary
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:artifact-scanner
npm run verify:production-artifacts
npm run test:e2e
```

Expected: every executed command passes. If any command fails, report the exact command and first actionable failure, fix only an in-scope regression with a focused failing test, and rerun the focused check followed by the failed gate.

- [ ] **Step 3: Perform adversarial code, accessibility, and content review**

Have independent reviewers inspect the exact final diff for pricing/rounding, client tampering, variant identity, Stripe authority, webhook regression, accessibility/focus, responsive collision, unapproved claims, and scope creep. Resolve actionable findings and rerun the affected focused checks plus `lint`, `typecheck`, and `build`.

- [ ] **Step 4: Write the handoff from observed evidence**

The handoff lists:

- exact commands and outcomes, including guarded/not-run lanes;
- the active worktree/branch and preserved unrelated changes;
- missing canonical IDs/SKUs/amounts/package units/defaults/ranks/dates/relations;
- missing positive prices, availability/inventory bindings, Stripe mappings, merchant approval, tax registrations, and shipping configuration;
- missing approved product/research/storage/FAQ/Why Choose/legal/disclaimer/privacy copy;
- missing newsletter provider and social URLs;
- calculator mode, limits/copy, binding-policy update, and separate production approval;
- confirmation that pending production variants remain browse-only and cannot create Checkout;
- migration/deployment/rollback steps that were actually verified versus still untested.

Do not present generated copy as legal approval or integration code as provider approval.

- [ ] **Step 5: Final authorized documentation commit**

```powershell
git add docs/deployment/storefront-refactor-handoff.md docs/runbooks/storefront-configuration.md docs/testing.md
git commit -m "docs(storefront): record verification and launch blockers"
```

## Final definition of done

The storefront refactor is code-complete only when all five phase plans pass, exact variants and quantity tiers are shared across card/product/cart/checkout, automatic WINTER30 never stacks, server revalidation controls Checkout, search and sorting share one approved index, bottom search/related products/home/FAQ/newsletter/footer work by keyboard and on mobile, motion is progressive and reduced-motion-safe, images do not materially shift layout, obsolete contradictory routes/components are removed, owner configuration and missing business inputs are documented, and every claimed verification result is backed by an observed command.

Production commerce remains not launched until every business-supplied activation item in the implementation contract is approved and configured.
