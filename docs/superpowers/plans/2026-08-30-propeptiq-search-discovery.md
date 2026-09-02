# PROPEPTIQ Search and Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the catalog and every public page one deterministic, approved-content-only search index with combined sorting and an accessible permanent bottom search Sheet.

**Architecture:** A browser-safe pure module normalizes, scores, and sorts compact search documents. The catalog receives product documents from its server page, while the bottom launcher lazily fetches the same server-built index on first open and uses the existing Radix Sheet for modal focus behavior.

**Tech Stack:** Next.js 16.3.2 App Router, React 19, TypeScript, Radix Sheet, Vitest/Testing Library, Playwright

**Spec:** `docs/propeptiq-storefront-refactor-contract.md`

## Global Constraints

- Complete the commerce foundation and safe storefront projection first.
- Share normalization and scoring; do not duplicate fuzzy logic between catalog and site search.
- Search only approved public products, SKUs, aliases, categories, descriptions, FAQs, pages, and section headings.
- Do not index draft, retired, medical, legal-review, server-only, Stripe, inventory, or customer data.
- Do not add Fuse, an external AI service, embeddings, hosted search, vector storage, or another dependency.
- Do not use fuzzy matching for normalized queries shorter than four characters.
- Product and information results are ordinary canonical links or anchored links.
- The Sheet traps/restores focus, supports Arrow Up/Down, Enter, and Escape, and is full-screen on small phones.
- The fixed launcher appears only in the public route group; checkout/account/admin/auth routes remain unaffected.
- Respect safe-area insets and `prefers-reduced-motion`; reserve bottom content space so the launcher does not cover public controls.
- Local task commits are authorized for this execution. Do not merge, deploy, or activate unapproved indexed content without separate release and content authorization.

---

## File structure

### Create

- `src/search/storefront-search.ts` and `.test.ts` — browser-safe normalization, scoring, and product sorting
- `src/search/storefront-index.ts` and `.test.ts` — server-only approved document projection
- `src/app/api/storefront-search/route.ts` and `.test.ts` — compact lazy public index
- `src/components/search/site-search-launcher.tsx`
- `src/components/search/site-search-sheet.tsx` and `.test.tsx`

### Modify

- `src/components/commerce/catalog-explorer.tsx` and `.test.tsx`
- `src/app/(public)/catalog/page.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/globals.css`
- `tests/e2e/public-storefront.spec.ts`

## Task 1: Deterministic normalized search and sort core

**Files:**

- Create: `src/search/storefront-search.ts`
- Create: `src/search/storefront-search.test.ts`

**Interfaces:**

- Consumes: compact `SearchEntry` documents and safe product-sort rows
- Produces: `normalizeSearchText`, `searchEntries`, `sortStorefrontProducts`

- [ ] **Step 1: Write failing normalization, score, and sort tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeSearchText, searchEntries, sortStorefrontProducts } from "./storefront-search";

it("normalizes case, accents, punctuation, and repeated whitespace", () => {
  expect(normalizeSearchText("  Café—NAD+  ")).toBe("cafe nad");
});

it("matches a bounded typo only at four or more characters", () => {
  expect(searchEntries(entries, "tirzpatide").map((result) => result.entry.id)).toContain("product-tirzepatide");
  expect(searchEntries(entries, "nad").map((result) => result.entry.id)).not.toContain("information-unrelated");
});

it("ranks exact, prefix, token, substring, metadata, then fuzzy", () => {
  expect(searchEntries(entries, "quality").map((result) => result.entry.id)).toEqual([
    "page-quality",
    "section-quality-records",
    "product-quality-alias",
  ]);
});

it("uses stable alphabetical and ID tie breaks", () => {
  expect(searchEntries(equalScoreEntries, "fixture").map((result) => result.entry.id)).toEqual(["a", "b"]);
});

it.each(["price-asc", "price-desc"] as const)("puts pending prices after active prices for %s", (mode) => {
  expect(sortStorefrontProducts(sortRows, mode).map((row) => row.id)).toEqual([
    mode === "price-asc" ? "active-low" : "active-high",
    mode === "price-asc" ? "active-high" : "active-low",
    "pending-a",
    "unavailable-a",
  ]);
});
```

Add cases for aliases, category, SKU, variant label, approved description, popularity ties, newest ties, and A-to-Z fallback.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/search/storefront-search.test.ts`

Expected: FAIL because the search module does not exist.

- [ ] **Step 3: Implement the exact public contracts**

```ts
export type SearchEntry = Readonly<{
  id: string;
  group: "products" | "information";
  title: string;
  href: string;
  description: string;
  exactTerms: readonly string[];
  keywords: readonly string[];
  popularityRank: number | null;
}>;

export type SearchResult = Readonly<{ entry: SearchEntry; score: number }>;

export type CatalogSort = "popular" | "price-asc" | "price-desc" | "alphabetical" | "newest";
```

Normalize with Unicode `NFKD`, strip combining marks, lowercase, replace punctuation with spaces, and collapse whitespace. Score exact term `600`, prefix `500`, all query tokens `400`, substring `300`, keyword/category/description `200`, and bounded token edit distance `100 - distance`. For fuzzy matching, allow distance 1 for query tokens of length 4–7 and distance 2 for 8 or more; reject shorter fuzzy queries. Sort by descending score, ascending configured popularity rank when present, `localeCompare("en", { sensitivity: "base" })`, then stable ID.

Product sort rows expose `lowestActiveEffectiveMinor: number | null`, `popularityRank`, `releasedAt`, `name`, and `id`. Pending/unavailable rows remain after active-price rows in both price directions.

- [ ] **Step 4: Run pure tests and type check**

Run: `npm test -- src/search/storefront-search.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/search/storefront-search.ts src/search/storefront-search.test.ts
git commit -m "feat(search): add deterministic storefront ranking"
```

## Task 2: Approved shared index and lazy endpoint

**Files:**

- Create: `src/search/storefront-index.ts`
- Create: `src/search/storefront-index.test.ts`
- Create: `src/app/api/storefront-search/route.ts`
- Create: `src/app/api/storefront-search/route.test.ts`

**Interfaces:**

- Consumes: public storefront products, approved controlled content, and the explicit approved public-information registry
- Produces: `buildStorefrontSearchIndex(input)` and a cached `GET` JSON endpoint

- [ ] **Step 1: Write failing index and route tests**

```ts
it("groups canonical products and approved information", () => {
  const index = buildStorefrontSearchIndex(fixtureContent);
  expect(index.map((entry) => [entry.group, entry.href])).toEqual([
    ["products", "/catalog/items/fixture-product"],
    ["information", "/quality-records"],
    ["information", "/#faq-fixture"],
  ]);
});

it("excludes draft and retired controlled content", () => {
  expect(buildStorefrontSearchIndex(fixtureContent).map((entry) => entry.id)).not.toContain("draft-faq");
});
```

Route tests assert exact response shape `{ version: 1, entries }`, prove that no `HEAD` handler is exported or claimed, verify that protected routes and server-only fields are absent, and confirm cache headers are public only because every document is already approved/public.

- [ ] **Step 2: Run tests and verify missing-module failures**

Run: `npm test -- src/search/storefront-index.test.ts src/app/api/storefront-search/route.test.ts`

Expected: FAIL.

- [ ] **Step 3: Build the index from canonical sources**

```ts
export type StorefrontSearchIndex = Readonly<{
  version: 1;
  entries: readonly SearchEntry[];
}>;
```

Project product names, approved aliases, categories, variant SKUs/labels, and approved descriptions. Project informational routes and anchored sections only from `src/content/public-information.ts`; validate that each record is approved and each href is same-origin, public, and begins with `/`. Cover every existing public informational route and each verified FAQ/section anchor. Deduplicate by stable ID and href, then sort by group/title/ID for stable serialization.

The route loads the index on demand and returns `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`. It logs no query because browser queries remain local.

- [ ] **Step 4: Run index and route tests**

Run: `npm test -- src/search/storefront-index.test.ts src/app/api/storefront-search/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/search/storefront-index.ts src/search/storefront-index.test.ts src/app/api/storefront-search/route.ts src/app/api/storefront-search/route.test.ts
git commit -m "feat(search): expose approved storefront index"
```

## Task 3: Catalog query, sorting, result count, and no-results state

**Files:**

- Modify: `src/components/commerce/catalog-explorer.tsx`
- Modify: `src/components/commerce/catalog-explorer.test.tsx`
- Modify: `src/app/(public)/catalog/page.tsx`

**Interfaces:**

- Consumes: Task 1 search/sort functions and server-projected products
- Produces: combined search/sort catalog interaction

- [ ] **Step 1: Write failing catalog interaction tests**

```tsx
it("keeps the query while sorting and announces the result count", async () => {
  render(<CatalogExplorer products={products} />);
  const search = screen.getByRole("searchbox", { name: "Search catalog" });
  await user.type(search, "tirzpatide");
  await user.selectOptions(screen.getByRole("combobox", { name: "Sort products" }), "price-asc");
  expect(search).toHaveValue("tirzpatide");
  expect(screen.getByRole("status")).toHaveTextContent("1 product found");
});

it("clears only the active query", async () => {
  render(<CatalogExplorer products={products} />);
  await user.type(screen.getByRole("searchbox", { name: "Search catalog" }), "fixture");
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("searchbox", { name: "Search catalog" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Sort products" })).toHaveValue("popular");
});
```

Assert all five labels exactly: `Most popular`, `Price: low to high`, `Price: high to low`, `A to Z`, and `Newest`. Assert loading copy during a deferred transition and an accessible no-results message with a clear action.

- [ ] **Step 2: Run the component test and verify failures**

Run: `npm test -- src/components/commerce/catalog-explorer.test.tsx`

Expected: FAIL because search is substring-only and sorting is absent.

- [ ] **Step 3: Refactor to the shared core**

Keep `query` and `sort` as independent state. Compute matched product IDs with `searchEntries`, filter products, then call `sortStorefrontProducts`; never clear query in the sort handler. Use `useDeferredValue(query)` for responsive rendering and mark the result status `aria-live="polite"`.

- [ ] **Step 4: Run catalog tests**

Run: `npm test -- src/components/commerce/catalog-explorer.test.tsx src/components/commerce/catalog-listing-card.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/commerce/catalog-explorer.tsx src/components/commerce/catalog-explorer.test.tsx 'src/app/(public)/catalog/page.tsx'
git commit -m "feat(catalog): combine fuzzy search and stable sorting"
```

## Task 4: Permanent bottom search Sheet

**Files:**

- Create: `src/components/search/site-search-launcher.tsx`
- Create: `src/components/search/site-search-sheet.tsx`
- Create: `src/components/search/site-search-sheet.test.tsx`
- Modify: `src/app/(public)/layout.tsx`

**Interfaces:**

- Consumes: lazy `/api/storefront-search` index and Task 1 scorer
- Produces: public fixed launcher and grouped modal navigation

- [ ] **Step 1: Write failing keyboard, grouping, and focus tests**

```tsx
it("loads once on open, groups results, and restores trigger focus", async () => {
  render(<SiteSearchLauncher loadIndex={loadIndex} />);
  const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
  await user.click(trigger);
  expect(loadIndex).toHaveBeenCalledTimes(1);
  await user.type(screen.getByRole("searchbox", { name: "Search products and information" }), "fixture");
  expect(screen.getByRole("heading", { name: "Products" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Pages or Information" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});

it("moves with arrows and selects with Enter", async () => {
  render(<SiteSearchLauncher loadIndex={loadIndex} />);
  await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
  const input = screen.getByRole("searchbox", { name: "Search products and information" });
  await user.type(input, "fixture");
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(navigate).toHaveBeenCalledWith("/quality-records#fixture");
});
```

Also prove Tab loops inside the Sheet, loading/error/empty states are announced, closing during a pending fetch cannot reopen the Sheet, and results never contain advice text.

- [ ] **Step 2: Run tests and verify missing-module failures**

Run: `npm test -- src/components/search/site-search-sheet.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the lazy modal interaction**

Use the existing `Sheet`, `SheetTrigger`, `SheetContent`, `SheetTitle`, and `SheetDescription`. Cache the validated index promise at module scope after the first open. Keep DOM order identical to visual order; use `aria-activedescendant` on the input and ordinary `<a>` results. Arrow keys update the active result, Enter follows it, Escape delegates to Radix, and selection closes before navigation.

Mount the launcher at the end of `src/app/(public)/layout.tsx`, outside `main`, so it appears on public pages only.

- [ ] **Step 4: Run component and public-shell tests**

Run: `npm test -- src/components/search/site-search-sheet.test.tsx src/components/site/public-shell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/search 'src/app/(public)/layout.tsx' src/components/site/public-shell.test.tsx
git commit -m "feat(search): add permanent accessible site search"
```

## Task 5: Safe-area, collision, and reduced-motion behavior

**Files:**

- Modify: `src/app/globals.css`
- Modify: `tests/e2e/public-storefront.spec.ts`

**Interfaces:**

- Consumes: Task 4 launcher data attributes and current CSS tokens
- Produces: bottom-safe layout and browser evidence

- [ ] **Step 1: Add failing Playwright assertions**

At widths 195, 320, 375, 768, 1024, 1440, and 1920, assert exactly one fixed launcher, no horizontal overflow, a minimum 44px target, and a centered bounding box. At `390×520`, open the Sheet, focus the search input, and assert the first result and close button remain visible.

Open the mobile menu and search Sheet separately; assert only the active overlay receives pointer hit-testing. Emulate reduced motion and assert launcher/Sheet/carousel computed transition durations are effectively zero.

- [ ] **Step 2: Run the focused browser test and verify layout failures**

Run: `npx playwright test tests/e2e/public-storefront.spec.ts --grep "site search"`

Expected: FAIL until CSS reserves the fixed lane and defines phone Sheet dimensions.

- [ ] **Step 3: Add restrained safe-area CSS**

Use a fixed bottom-center launcher lane with `left: 50%`, `transform: translateX(-50%)`, `bottom: calc(1rem + env(safe-area-inset-bottom))`, a `max-width` within the site token, and `pointer-events: none` on the lane with `pointer-events: auto` only on actual controls. Add public-shell bottom padding equal to the launcher height plus safe-area inset. Make the Sheet `100dvh` and full width under the existing small-phone breakpoint; cap desktop Sheet height and grow it upward. Place the launcher below modal/cookie overlay z-index and above normal page content.

Inside the existing reduced-motion media query, disable launcher/Sheet transitions and smooth scrolling.

- [ ] **Step 4: Run search unit, browser, and phase gates**

Run sequentially:

```powershell
npm test -- src/search/storefront-search.test.ts src/search/storefront-index.test.ts src/app/api/storefront-search/route.test.ts src/components/commerce/catalog-explorer.test.tsx src/components/search/site-search-sheet.test.tsx
npx playwright test tests/e2e/public-storefront.spec.ts --grep "site search|catalog search"
npm run lint
npm run typecheck
npm run build
```

Expected: every executed command passes.

- [ ] **Step 5: Independent review and authorized commit**

Request an accessibility review of focus trapping, live regions, and hit testing, resolve findings, rerun focused checks, then:

```powershell
git add src/app/globals.css tests/e2e/public-storefront.spec.ts
git commit -m "test(search): verify safe-area and keyboard behavior"
```

## Search completion gate

This phase is complete when catalog query and sorting compose without state resets; aliases, SKU, category, approved text, typo tolerance, no-results, and stable ties are covered; pending products sort after active products; the bottom Sheet lazily searches Products and Pages or Information; keyboard/focus/mobile/safe-area/reduced-motion behavior passes; and draft or sensitive content never enters the public index.
