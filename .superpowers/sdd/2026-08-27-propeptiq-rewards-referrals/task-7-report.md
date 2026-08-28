# Task 7A Report — Public editorial growth experience

## Scope and checkpoint

- Started from clean `1832ca5666c88096236a3ec5e8cd009adf905a89`.
- Implementation commits: `ae297d8` (`feat(ui): add editorial public growth experience`) and review fix `701b18a` (`fix(ui): distinguish public growth read failures`).
- Scope remained public-only: shell, homepage, browse catalog discovery, public database-product points, `/rewards`, `/partners`, and both public terms routes.
- No account, admin, Task 7B/8+, checkout/cart refinement, E2E, production policy activation, production data, or external operation was added.

## Delivered behavior

- Primary navigation is Catalog, Quality Records, Research Use, and Rewards; Cart and Sign in remain header actions; Partner Program is footer-only. All internal links use `next/link`.
- The homepage keeps the approved off-white/ink/moss and Newsreader/Geist system, reduces hero depth, places the Proof Rail before catalog highlights, and renders at most one injected active-loyalty strip.
- Catalog discovery has persistent labels plus exact source-name, source-code, and package-unit filters. The pinned publication remains 53 presentation cards, 56 exact source names, and 103 source variants; duplicated `LPC`, `PN5`, and source-name distinctions are preserved without mutating input rows.
- Browse-only cards remain price-free and non-purchasable. `Earn N points` appears only for a production catalog projection with a positive USD price and one active server-projected loyalty policy.
- Public rewards, partner, and terms routes render active/current server projections only. A genuine absence shows the inactive state; database, schema, or malformed-record failures show a safe temporary-unavailable/retry state without exposing details or values.
- Public rewards copy says “Earn points”; active, inactive, and read-error route tests prohibit “purchase points” and “buy points.”
- The mobile Sheet remains in use below 1280px, the horizontal Proof Rail begins at 1280px, new practical targets are at least 44px, new explanatory copy is 16px, and new interactions use stable 200ms color transitions and visible focus styles.

## RED evidence

- `npm test -- --run src/components/site/public-shell.test.tsx` — 1 expected failure: primary navigation did not expose `Research Use`/Rewards.
- `npm test -- --run 'src/app/(public)/rewards/page.test.tsx' 'src/app/(public)/partners/page.test.tsx'` — 2 expected missing-route suites.
- `npm test -- --run src/components/commerce/catalog-explorer.test.tsx` — expected missing-component suite.
- Rewards/partners active-projection run — 2 expected assertion failures because active values were not rendered.
- Terms route run — 2 expected missing-route suites.
- `npm test -- --run src/components/growth/program-strip.test.tsx src/components/growth/earn-points.test.tsx` — 2 expected missing-component suites.
- `npm test -- --run 'src/app/(public)/catalog/[slug]/page.test.tsx'` — 1 expected assertion failure because product points were not wired.
- `npm test -- --run src/components/site/public-semantics.test.tsx` — 1 expected assertion failure because the active strip/Proof Rail ordering was absent.
- Review fix RED: `npm test -- --run 'src/app/(public)/partners/page.test.tsx' 'src/app/(public)/rewards/terms/page.test.tsx' 'src/app/(public)/partners/terms/page.test.tsx' 'src/app/(public)/catalog/[slug]/page.test.tsx' 'src/app/(public)/page.test.tsx'` — 5 files failed; 10 tests failed and 5 passed because these routes still consumed the former nullable projection and mislabeled read errors.

## GREEN and final gates

- Required focused components: `npm test -- --run src/components/site src/components/commerce src/components/growth` — 12 files, 28 tests passed.
- Focused public routes: `npm test -- --run 'src/app/(public)/rewards' 'src/app/(public)/partners' 'src/app/(public)/catalog/[slug]/page.test.tsx'` — 5 files, 10 tests passed.
- `npx next typegen` — route types generated successfully after the first typecheck identified stale generated route metadata.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `git diff --check` — passed.
- Review fix GREEN: `npm test -- --run 'src/growth/public-growth-server.test.ts' 'src/app/(public)/rewards/page.test.tsx' 'src/app/(public)/partners/page.test.tsx' 'src/app/(public)/rewards/terms/page.test.tsx' 'src/app/(public)/partners/terms/page.test.tsx' 'src/app/(public)/catalog/[slug]/page.test.tsx' 'src/app/(public)/page.test.tsx'` — 7 files and 21 tests passed.
- Final focused review-fix gate: `npm test -- --run src/components/site src/components/commerce src/components/growth src/growth/public-growth-server.test.ts 'src/app/(public)/page.test.tsx' 'src/app/(public)/rewards' 'src/app/(public)/partners' 'src/app/(public)/catalog/[slug]/page.test.tsx'` — 19 files and 49 tests passed.
- Full unit suite: `npm test -- --run` — 97 files and 1,080 tests passed.
- Screenshots: not captured; no Task 10 screenshot/E2E work was started.

## Concerns and inactive truth

- Public growth values intentionally remain absent unless the runtime database exposes valid current active policy records. Zero current records are inactive; duplicate, malformed, schema-failing, or unavailable reads return one safe `read_error` result and discard partial projection values.
- The homepage count is owner-publication evidence, not popularity, membership, inventory, or sales evidence.
- No production rates, terms, policy activation, product prices, countdowns, urgency, savings, testimonials, or trust claims were introduced.
- No Task 7B work was started.
