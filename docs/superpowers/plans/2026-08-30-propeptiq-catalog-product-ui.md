# PROPEPTIQ Catalog and Product UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disconnected browse and transactional product experiences with accessible data-driven cards, variant selection, quantity controls, pricing, approved information, related products, and a gated laboratory concentration calculator.

**Architecture:** Build one server-produced storefront projection from the canonical commerce contracts, retain `/catalog/items/[slug]` as the linked product route, and reuse existing local images, cart provider, Sheet, and design tokens. Client components receive safe product/price projections only; server-only payment mappings never cross the boundary.

**Tech Stack:** Next.js 16.3.2 App Router, React 19, TypeScript, Tailwind CSS 4, Radix Sheet, next/image, Vitest/Testing Library

**Spec:** `docs/propeptiq-storefront-refactor-contract.md`

## Global Constraints

- Complete `2026-08-30-propeptiq-commerce-foundation.md` first.
- Preserve the current brand palette, Newsreader/Geist typography, local optimized images, focus rules, and reduced-motion behavior.
- Never silently choose the first array element; `defaultVariantId` is explicit and multi-variant `ADD` opens a selector.
- Local/test/explicit non-production preview may show `$0.00`, struck `$0.00`, and `-30%`; production pending prices show only `Pricing coming soon` with no fake savings or discount badge.
- Dynamic price, availability, savings, subtotal, variant, and cart confirmation changes use polite live announcements.
- Product/research/storage/legal content renders only when its controlled status is `approved`.
- No dosage, administration, syringe-unit, treatment, safety, purity, testing, shipping, guarantee, or research claim may be invented.
- The concentration calculator is disabled in production until the server setting is `approved` and the binding content policy is updated.
- Local task commits are authorized for this execution. Do not migrate, merge, deploy, or activate products without the corresponding separate business-data and release authorization.

### Repository-discovery amendment at the review-clean commerce-foundation head

- The public projection is a discriminated union: canonical rows have stable canonical/default/variant identities; browse-only rows retain owner-published display configurations with null canonical/default identity and no purchasable variant. Never create slug/code-derived IDs or SKUs.
- Task 1 creates the shared controlled-content lifecycle module specified by the public-content plan, with an empty production registry. The later public-content phase consumes and extends that module.
- `/catalog/items/[slug]` remains the canonical linked browse route. Do not redirect `/catalog/[slug]` during Task 1: current demo/database transactional slugs and semantics are not equivalent to the 56-row browse source, and production parity cannot be proven from the repository. Task 1 adds an explicit tested convergence assessment while preserving the legacy route unchanged.
- The binding execution details and exact sources/consumer adaptations are recorded in `.superpowers/sdd/2026-08-31-propeptiq-catalog-product-ui/task-1-brief.md`. For Task 1, that reviewed brief **supersedes in full** the earlier single-shape interface sample, its non-null pending-price fields, its omission of browse display configurations, and its immediate-redirect instruction. The corrected public contract is a canonical/browse-only discriminated union, `baseUnitMinor` and `currency` are nullable when no authoritative current price exists, every row retains `displayConfigurations`, and `/catalog/[slug]` remains unchanged until the separately tested convergence gate and fresh production census pass.

---

## File structure

### Create

- `src/catalog/storefront-public.ts` and `.test.ts` — safe product projection and lookup
- `src/components/commerce/product-price.tsx` and `.test.tsx`
- `src/components/commerce/variant-selector.tsx` and `.test.tsx`
- `src/components/commerce/quantity-tier-selector.tsx` and `.test.tsx`
- `src/components/commerce/product-purchase-panel.tsx` and `.test.tsx`
- `src/components/commerce/quick-add-variant-sheet.tsx` and `.test.tsx`
- `src/components/commerce/related-products-carousel.tsx` and `.test.tsx`
- `src/domain/concentration.ts` and `.test.ts`
- `src/components/commerce/laboratory-concentration-calculator.tsx` and `.test.tsx`
- `src/config/env-schema.test.ts`

### Modify

- `src/app/(public)/catalog/page.tsx`
- `src/app/(public)/catalog/items/[slug]/page.tsx`
- `src/app/(public)/catalog/[slug]/page.tsx`
- `src/components/commerce/catalog-explorer.tsx`
- `src/components/commerce/catalog-listing-card.tsx`
- `src/components/commerce/catalog-item-detail.tsx`
- `src/components/commerce/add-to-cart-button.tsx`
- `src/config/env-schema.ts`
- `src/app/globals.css`

## Task 1: Safe storefront projection and route convergence

**Files:**

- Create: `src/catalog/storefront-public.ts`
- Create: `src/catalog/storefront-public.test.ts`
- Create: `src/catalog/storefront-public-server.ts`
- Create: `src/catalog/storefront-public-server.test.ts`
- Create: `src/content/storefront-content.ts`
- Create: `src/content/storefront-content.test.ts`
- Modify: `src/catalog/types.ts`
- Modify: `src/catalog/database-catalog.ts`
- Create: `src/catalog/database-catalog.test.ts`
- Modify: `src/catalog/public-catalog.ts`
- Modify: `src/catalog/public-catalog.test.ts`
- Modify: `src/db/repositories/checkout-repository.ts`
- Modify: `tests/integration/checkout-repository.test.ts`
- Modify: `src/app/(public)/catalog/page.tsx`
- Modify: `src/app/(public)/catalog/items/[slug]/page.tsx`
- Create: `src/app/(public)/catalog/page.test.tsx`
- Create: `src/app/(public)/catalog/items/[slug]/page.test.tsx`
- Preserve: `src/app/(public)/catalog/[slug]/page.tsx` and its existing `page.test.tsx`
- Modify: `src/components/commerce/catalog-explorer.tsx` and `.test.tsx`
- Modify: `src/components/commerce/catalog-listing-card.tsx` and `.test.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx` and `.test.tsx`

**Interfaces:**

- Consumes: the owner-published browse catalog, canonical products and validated bindings, variant-scoped runtime price/availability facts, verified image metadata, and controlled content.
- Produces: a canonical/browse-only `PublicStorefrontProduct` discriminated union, a pure projection/lookup API, a server-only route loader, and a typed legacy-route convergence assessment.
- The reviewed SDD Task 1 brief is the binding implementation contract for field-level types, source acquisition, fail-closed behavior, and route scope.

- [ ] **Step 1: Write failing projection tests**

```ts
it("keeps server-only payment mappings out of public variants", async () => {
  const product = await findPublicStorefrontProduct("fixture-product", fixtureOptions);
  expect(product?.variants[0]).not.toHaveProperty("stripePriceId");
  expect(product?.variants[0]).not.toHaveProperty("stripeProductId");
});

it("uses the explicit default variant", async () => {
  const product = await findPublicStorefrontProduct("fixture-product", fixtureOptions);
  expect(product?.defaultVariantId).toBe("20000000-0000-4000-8000-000000000002");
});

it("omits draft controlled content", async () => {
  const product = await findPublicStorefrontProduct("fixture-product", fixtureOptions);
  expect(product?.content.map((entry) => entry.id)).toEqual(["approved-description"]);
});
```

Also assert that an unbound browse product remains visible with `pricing_pending`, approved local image dimensions, and no checkout-ready variant.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/catalog/storefront-public.test.ts`

Expected: FAIL because the safe projection does not exist.

- [ ] **Step 3: Define the public projection**

The original single-shape type sample and redirect instruction are superseded. Implement the exact reviewed SDD contract instead:

- canonical products have a stable non-null product ID, explicit non-null default variant, safe allowlisted canonical variants, configured related IDs, approved referenced content, and the owner-published display configurations;
- browse-only products have `id: null`, `defaultVariantId: null`, no canonical variants or SKU, `pricingState: "pricing_pending"`, and all owner-published display configurations;
- public variant `baseUnitMinor` is `number | null`, `currency` is `"USD" | null`, and `checkoutReady` is a safe boolean only; no authoritative current variant price or exact server mapping agreement means checkout readiness is false;
- neither union member exposes payment-provider mappings, internal price/version IDs, inventory internals, or private binding keys;
- `/catalog` and `/catalog/items/[slug]` consume the safe projection while preserving their current browse behavior and retained-route 404s;
- `/catalog/[slug]` keeps its current demo/database transaction and rewards behavior in Task 1. Only the pure typed convergence assessment is added; no redirect or link migration occurs.

- [ ] **Step 4: Run projection and route tests**

Run:

```powershell
npm test -- src/content/storefront-content.test.ts src/catalog/database-catalog.test.ts src/catalog/public-catalog.test.ts src/catalog/storefront-public.test.ts src/catalog/storefront-public-server.test.ts 'src/app/(public)/catalog/page.test.tsx' 'src/app/(public)/catalog/items/[slug]/page.test.tsx' 'src/app/(public)/catalog/[slug]/page.test.tsx' src/components/commerce/catalog-explorer.test.tsx src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/catalog-item-detail.test.tsx src/components/site/public-shell.test.tsx src/components/site/public-semantics.test.tsx
npm run test:integration -- tests/integration/checkout-repository.test.ts
```

Expected: PASS, including pending-null preservation, active-positive projection, legacy null-price fail-closed behavior, and checkout facts that reject null rather than coercing it to zero.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/catalog/types.ts src/catalog/database-catalog.ts src/catalog/database-catalog.test.ts src/catalog/public-catalog.ts src/catalog/public-catalog.test.ts src/catalog/storefront-public.ts src/catalog/storefront-public.test.ts src/catalog/storefront-public-server.ts src/catalog/storefront-public-server.test.ts src/content/storefront-content.ts src/content/storefront-content.test.ts src/db/repositories/checkout-repository.ts tests/integration/checkout-repository.test.ts 'src/app/(public)/catalog/page.tsx' 'src/app/(public)/catalog/page.test.tsx' 'src/app/(public)/catalog/items/[slug]/page.tsx' 'src/app/(public)/catalog/items/[slug]/page.test.tsx' src/components/commerce/catalog-explorer.tsx src/components/commerce/catalog-explorer.test.tsx src/components/commerce/catalog-listing-card.tsx src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/catalog-item-detail.tsx src/components/commerce/catalog-item-detail.test.tsx
git commit -m "feat(catalog): unify public product projection"
```

## Task 2: Product cards, price presentation, and required quick-add selection

**Files:**

- Modify: `src/components/commerce/catalog-listing-card.tsx`
- Create: `src/components/commerce/product-price.tsx`
- Create: `src/components/commerce/product-price.test.tsx`
- Create: `src/components/commerce/quick-add-variant-sheet.tsx`
- Create: `src/components/commerce/quick-add-variant-sheet.test.tsx`
- Modify: `src/components/commerce/add-to-cart-button.tsx`

**Interfaces:**

- Consumes: public product with nullable price fields and safe `checkoutReady`, `calculateVariantLinePrice`, runtime price-presentation mode, cart `addVariant`
- Produces: card price/availability display and explicit quick-add selection

- [ ] **Step 1: Write failing card and quick-add tests**

```tsx
it("opens variant choice instead of silently adding a multi-variant product", async () => {
  render(<CatalogListingCard product={multiVariantProduct} pricingMode="preview" />);
  await user.click(screen.getByRole("button", { name: /add fixture product/i }));
  expect(screen.getByRole("dialog", { name: /choose a variant/i })).toBeVisible();
  expect(addVariant).not.toHaveBeenCalled();
});

it("shows preview zero-dollar sale treatment only outside production", () => {
  const { rerender } = render(<ProductPrice price={zeroWinterPrice} mode="preview" />);
  expect(screen.getAllByText("$0.00")).toHaveLength(2);
  expect(screen.getByText("-30%")).toBeVisible();
  rerender(<ProductPrice price={zeroWinterPrice} mode="production" />);
  expect(screen.getByText("Pricing coming soon")).toBeVisible();
  expect(screen.queryByText("-30%")).toBeNull();
});
```

Assert cards include reserved image dimensions, name, variant summary (`5 mg` or `From 5 mg`), standard/effective prices, availability text, and a labelled `ADD` button.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/product-price.test.tsx src/components/commerce/quick-add-variant-sheet.test.tsx`

Expected: FAIL because price and selection components do not exist.

- [ ] **Step 3: Implement presentation and quick add**

```ts
export type PricePresentationMode = "local" | "test" | "preview" | "production";

export function canShowPendingSalePreview(mode: PricePresentationMode): boolean {
  return mode !== "production";
}

export function canAddPublicVariant(
  variant: Pick<PublicStorefrontVariant,
    "availability" | "priceStatus" | "baseUnitMinor" | "currency" | "checkoutReady">,
  mode: PricePresentationMode,
): boolean {
  if (variant.availability === "unavailable") return false;
  if (mode === "production") return variant.checkoutReady;
  return variant.checkoutReady || (
    variant.priceStatus === "pending" &&
    variant.baseUnitMinor === 0 &&
    variant.currency === "USD"
  );
}
```

Use the existing Radix Sheet for variant choice, radio-group semantics for the selected variant, explicit availability copy, and a polite `Added {quantity} × {variant label} to cart` announcement. A one-variant product may add its explicit `defaultVariantId`; a multi-variant product always opens the Sheet.

`ProductPrice` receives the allowlisted variant price fields, quantity, resolved effective discount, and `PricePresentationMode`. `AddToCartButton` gains an explicit `canAdd` boolean plus a safe human-readable disabled reason; the quick-add/purchase-panel parent computes `canAddPublicVariant` and the button must check it before calling `addVariant`. Do not pass Stripe data or derive readiness inside the button.

Branch before calling `calculateVariantLinePrice`: when `baseUnitMinor` or `currency` is null, render pending/unavailable copy and do not perform money arithmetic. Never coerce null to zero. Only an explicitly persisted pending `baseUnitMinor: 0` may call the pricing helper for `$0.00` layout math, and only when mode is `local`, `test`, or `preview`. Treat `EffectiveLinePrice.checkoutReady` as an arithmetic-price readiness detail only; it does not include inventory, currency acquisition, or payment mappings and must never replace the public variant's mapping-aware `checkoutReady` purchase gate. The existing `/api/catalog/preview` use is a guarded synthetic-local harness, not the production public-product control path. The server remains authoritative and revalidates readiness at quote/checkout time.

Required presentation/control matrix:

| Variant state | Presentation | ADD |
|---|---|---|
| active positive USD, available, `checkoutReady: true` | calculate/render standard, effective, savings, subtotal | enabled |
| active positive USD, otherwise available, `checkoutReady: false` | render price plus honest checkout-unavailable copy | disabled |
| pending explicit `0`/USD in local/test/preview | render the explicit `$0.00` preview treatment; no fake successful checkout | enabled only for local cart testing |
| pending in production, pending positive, null/null, unavailable, or malformed active zero | `Pricing coming soon` or unavailable copy; no sale arithmetic for null/malformed data | disabled |

Test each row, including an active/available mapping-missing variant, and assert `addVariant` is not called whenever `canAdd` is false.

- [ ] **Step 4: Run card and quick-add tests**

Run: `npm test -- src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/product-price.test.tsx src/components/commerce/quick-add-variant-sheet.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/commerce/catalog-listing-card.tsx src/components/commerce/product-price.tsx src/components/commerce/product-price.test.tsx src/components/commerce/quick-add-variant-sheet.tsx src/components/commerce/quick-add-variant-sheet.test.tsx src/components/commerce/add-to-cart-button.tsx
git commit -m "feat(catalog): add safe variant-aware purchase cards"
```

## Task 3: Product purchase panel and approved information sections

**Files:**

- Create: `src/components/commerce/variant-selector.tsx`
- Create: `src/components/commerce/variant-selector.test.tsx`
- Create: `src/components/commerce/quantity-tier-selector.tsx`
- Create: `src/components/commerce/quantity-tier-selector.test.tsx`
- Create: `src/components/commerce/product-purchase-panel.tsx`
- Create: `src/components/commerce/product-purchase-panel.test.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx`

**Interfaces:**

- Consumes: `PublicStorefrontProduct`, pure pricing, active promotion projection, cart `addVariant`
- Produces: interactive variant/quantity state and approved-only product information

- [ ] **Step 1: Write failing interaction tests**

Test these exact behaviors:

```tsx
await user.click(screen.getByRole("radio", { name: "10 mg" }));
expect(screen.getByRole("status")).toHaveTextContent(/10 mg.*pricing coming soon/i);

await user.click(screen.getByRole("button", { name: "3 bottles" }));
expect(screen.getByText("10% discount")).toBeVisible();

await user.click(screen.getByRole("button", { name: "10 or more bottles" }));
expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveValue(10);

await user.clear(screen.getByRole("spinbutton", { name: "Exact quantity" }));
await user.type(screen.getByRole("spinbutton", { name: "Exact quantity" }), "11");
expect(screen.getByText("30% discount")).toBeVisible();
```

Assert minus/plus controls work from 1 through 25, preset selection does not remove normal quantity controls, and changing variant updates price/availability/subtotal without navigation. Add-to-cart is disabled for unavailable variants and for every null-price state. The only pending-price cart exception is an explicitly persisted `priceStatus: "pending"`, `baseUnitMinor: 0`, `currency: "USD"` fixture when `PricePresentationMode` is `local`, `test`, or `preview`; it still cannot checkout. Production ADD requires `checkoutReady: true`.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- src/components/commerce/variant-selector.test.tsx src/components/commerce/quantity-tier-selector.test.tsx src/components/commerce/product-purchase-panel.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the controlled purchase panel**

```ts
const QUANTITY_PRESETS = Object.freeze([
  { label: "1 bottle", quantity: 1 },
  { label: "2 bottles", quantity: 2 },
  { label: "3 bottles", quantity: 3 },
  { label: "10 or more bottles", quantity: 10 },
] as const);
```

Initialize from `defaultVariantId`, never index zero. Use buttons/radio inputs with visible selected text in addition to color. Add one `aria-live="polite"` summary containing variant, quantity, availability, unit price, savings, and subtotal; do not split simultaneous updates across competing live regions.

Render description, technical information, approved research, storage, and notices from approved controlled-content records only. Omit an unapproved section rather than filling it with generated text; owner-only review notices belong in the configuration guide, not the public page.

- [ ] **Step 4: Run panel and product-detail tests**

Run: `npm test -- src/components/commerce/variant-selector.test.tsx src/components/commerce/quantity-tier-selector.test.tsx src/components/commerce/product-purchase-panel.test.tsx src/components/commerce/catalog-item-detail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/commerce/variant-selector.tsx src/components/commerce/variant-selector.test.tsx src/components/commerce/quantity-tier-selector.tsx src/components/commerce/quantity-tier-selector.test.tsx src/components/commerce/product-purchase-panel.tsx src/components/commerce/product-purchase-panel.test.tsx src/components/commerce/catalog-item-detail.tsx src/components/commerce/catalog-item-detail.test.tsx
git commit -m "feat(product): add accessible variant purchase controls"
```

## Task 4: Frequently Researched Together carousel

**Files:**

- Create: `src/components/commerce/related-products-carousel.tsx`
- Create: `src/components/commerce/related-products-carousel.test.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx`

**Interfaces:**

- Consumes: approved `relatedProductIds`, public product projection, `CatalogListingCard`
- Produces: non-autoplay horizontal scroll-snap recommendations and quick add

- [ ] **Step 1: Write failing related-product tests**

```tsx
it("excludes the current product and unavailable recommendations", () => {
  render(<RelatedProductsCarousel currentProductId="product-a" products={fixtures} />);
  expect(screen.queryByText("Product A")).toBeNull();
  expect(screen.queryByText("Unavailable Product")).toBeNull();
});

it("uses labelled controls without autoplay", async () => {
  render(<RelatedProductsCarousel currentProductId="product-a" products={fixtures} />);
  expect(screen.getByRole("button", { name: "Previous related products" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Next related products" })).toBeVisible();
  expect(vi.getTimerCount()).toBe(0);
});
```

Assert the heading text is exactly `Frequently Researched Together`, multi-variant ADD opens the selector, images retain a 4:3 reserved frame, and cart confirmation is announced.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/components/commerce/related-products-carousel.test.tsx`

Expected: FAIL because the carousel does not exist.

- [ ] **Step 3: Implement semantic scroll snap**

Use a labelled `<section>`, `<ul>` and `<li>` cards, `overflow-x: auto`, CSS scroll snap, and buttons that call `scrollBy({ left: viewportWidth, behavior })`. Choose `behavior: "auto"` when `prefers-reduced-motion` matches, otherwise `"smooth"`. Do not clone slides, autoplay, or hide content from keyboard users.

- [ ] **Step 4: Run carousel and card tests**

Run: `npm test -- src/components/commerce/related-products-carousel.test.tsx src/components/commerce/catalog-listing-card.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/commerce/related-products-carousel.tsx src/components/commerce/related-products-carousel.test.tsx src/components/commerce/catalog-item-detail.tsx
git commit -m "feat(product): add configured related research carousel"
```

## Task 5: Neutral concentration math behind the production launch gate

**Files:**

- Create: `src/domain/concentration.ts`
- Create: `src/domain/concentration.test.ts`
- Create: `src/components/commerce/laboratory-concentration-calculator.tsx`
- Create: `src/components/commerce/laboratory-concentration-calculator.test.tsx`
- Modify: `src/config/env-schema.ts`
- Create: `src/config/env-schema.test.ts`
- Modify: `src/components/commerce/catalog-item-detail.tsx`
- Modify: binding policy documents only after explicit owner approval

**Interfaces:**

- Consumes: owner-approved calculator limits/copy and server `RECONSTITUTION_CALCULATOR_MODE`
- Produces: `calculateConcentration(input, limits)` and a server-gated client form

- [ ] **Step 1: Write failing pure-math and validation tests**

```ts
const limits = { maxVialMg: 1_000, maxDiluentMl: 1_000, maxSampleMl: 1_000 } as const;

it("calculates concentration and optional sample material", () => {
  expect(calculateConcentration({ vialMg: 10, diluentMl: 2, sampleMl: 0.1 }, limits)).toEqual({
    ok: true,
    value: { mgPerMl: 5, mcgPerMl: 5_000, sampleMg: 0.5, sampleMcg: 500 },
  });
});

it.each([
  [{ vialMg: 0, diluentMl: 2 }, "vialMg"],
  [{ vialMg: 10, diluentMl: -1 }, "diluentMl"],
  [{ vialMg: 10, diluentMl: 2, sampleMl: 1_001 }, "sampleMl"],
])("rejects invalid laboratory input", (input, field) => {
  expect(calculateConcentration(input, limits)).toMatchObject({ ok: false, errors: [{ field }] });
});
```

The numeric limits above are test fixtures only. Production mode cannot become `approved` until owner-reviewed limits and explanatory copy exist.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/domain/concentration.test.ts src/components/commerce/laboratory-concentration-calculator.test.tsx`

Expected: FAIL because the math and component modules do not exist.

- [ ] **Step 3: Implement math-only conversion and server gate**

```ts
export type ConcentrationInput = Readonly<{
  vialMg: number;
  diluentMl: number;
  sampleMl?: number;
}>;

export type ConcentrationResult = Readonly<{
  mgPerMl: number;
  mcgPerMl: number;
  sampleMg?: number;
  sampleMcg?: number;
}>;
```

Explain only `vial mg ÷ diluent mL = mg/mL`, `mg/mL × 1,000 = mcg/mL`, and `mg/mL × sample mL = sample mg`. Use neutral `sample volume` labels. Add `RECONSTITUTION_CALCULATOR_MODE=disabled|preview|approved`, default `disabled`; production identities reject `preview`. Render nothing in production unless mode is `approved` and approved controlled content/limits are present.

Do not add dosage, draw recommendations, syringe units, administration frequency, injection technique, treatment language, physical effects, protocols, or pre-populated product examples.

- [ ] **Step 4: Run math, component, environment, and content-policy tests**

Run: `npm test -- src/domain/concentration.test.ts src/components/commerce/laboratory-concentration-calculator.test.tsx src/config/env-schema.test.ts src/domain/content-policy.test.ts`

Expected: PASS, including calculator absent-by-default and production-preview rejection.

- [ ] **Step 5: Run the catalog/product phase gate**

Run sequentially:

```powershell
npm run verify:workspace-boundary
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: every executed command passes. Request independent accessibility and content-policy review before dependent search/content phases.

- [ ] **Step 6: Authorized commit**

```powershell
git add src/domain/concentration.ts src/domain/concentration.test.ts src/components/commerce/laboratory-concentration-calculator.tsx src/components/commerce/laboratory-concentration-calculator.test.tsx src/config/env-schema.ts src/config/env-schema.test.ts src/components/commerce/catalog-item-detail.tsx src/domain/content-policy.test.ts docs
git commit -m "feat(product): add gated laboratory concentration math"
```

## Catalog/product completion gate

This phase is complete when cards and retained product pages share the safe projection and canonical pricing where an approved binding exists, every multi-variant ADD requires an explicit choice, quantity and variant changes update announced totals without navigation, pending production prices are honest, related products are configured and non-autoplay, only approved content renders, and the calculator is math-only and production-disabled by default. The still-intentional browse/transactional route split, its link ownership, and its non-redirect convergence guard must remain documented and tested; actual convergence remains blocked on exhaustive identity/semantic parity plus a fresh production census.
