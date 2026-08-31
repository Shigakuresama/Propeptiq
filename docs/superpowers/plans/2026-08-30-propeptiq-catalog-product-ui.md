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
- Modify: `src/app/(public)/catalog/page.tsx`
- Modify: `src/app/(public)/catalog/items/[slug]/page.tsx`
- Modify: `src/app/(public)/catalog/[slug]/page.tsx`

**Interfaces:**

- Consumes: canonical products/variants and pricing results from the commerce foundation
- Produces: `PublicStorefrontProduct`, `getPublicStorefrontCatalog(options)`, `findPublicStorefrontProduct(slug, options)`

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

```ts
export type PublicStorefrontVariant = Readonly<{
  id: string;
  sku: string;
  label: string;
  availability: "preview_only" | "available" | "unavailable";
  priceStatus: "pending" | "active" | "unavailable";
  baseUnitMinor: number;
  currency: "USD";
}>;

export type PublicStorefrontProduct = Readonly<{
  id: string;
  slug: string;
  name: string;
  category: string;
  image: Readonly<{ src: string; alt: string; width: number; height: number }>;
  aliases: readonly string[];
  popularityRank: number;
  releasedAt: string;
  defaultVariantId: string;
  variants: readonly PublicStorefrontVariant[];
  relatedProductIds: readonly string[];
  content: readonly ApprovedPublicContent[];
}>;
```

Make `/catalog/items/[slug]` render this unified product. Convert `/catalog/[slug]` into a permanent route-level redirect to `/catalog/items/[slug]` only after tests prove every current transactional slug resolves. Retain unknown-slug `notFound()` behavior and current catalog links.

- [ ] **Step 4: Run projection and route tests**

Run: `npm test -- src/catalog/storefront-public.test.ts src/components/commerce/catalog-item-detail.test.tsx src/components/site/public-shell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/catalog/storefront-public.ts src/catalog/storefront-public.test.ts 'src/app/(public)/catalog' src/components/commerce/catalog-item-detail.tsx src/components/commerce/catalog-item-detail.test.tsx
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

- Consumes: public product, `calculateVariantLinePrice`, runtime price-presentation mode, cart `addVariant`
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
export type PricePresentationMode = "development" | "test" | "preview" | "production";

export function canShowPendingSalePreview(mode: PricePresentationMode): boolean {
  return mode !== "production";
}
```

Use the existing Radix Sheet for variant choice, radio-group semantics for the selected variant, explicit availability copy, and a polite `Added {quantity} × {variant label} to cart` announcement. A one-variant product may add its explicit `defaultVariantId`; a multi-variant product always opens the Sheet.

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

Assert minus/plus controls work from 1 through 25, preset selection does not remove normal quantity controls, changing variant updates price/availability/subtotal without navigation, and add-to-cart is disabled for unavailable variants but allowed for pending-price local preview carts.

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

This phase is complete when cards and product pages share canonical data and pricing, every multi-variant ADD requires an explicit choice, quantity and variant changes update announced totals without navigation, pending production prices are honest, related products are configured and non-autoplay, only approved content renders, the calculator is math-only and production-disabled by default, and the prior browse-only/transactional route split no longer exposes contradictory customer behavior.
