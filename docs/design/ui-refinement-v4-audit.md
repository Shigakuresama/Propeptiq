# PROPEPTIQ UI refinement v4 audit

**Status:** completed before application UI edits.

**Audited commit:** `716fa79dcd7926820952ea5ed04ab3e9cf03ef1d`

**Visual direction:** preserve the approved “clinical archive meets premium industrial design” system. This is a refinement, not a visual reboot.

## Evidence reviewed

- Binding design and product contracts in `design-system/MASTER.md`, `docs/design/`, `docs/product-requirements.md`, and `docs/compliance/`.
- Installed Next.js 16.3.2 guidance for layouts/pages, Server and Client Components, CSS, images, fonts, Playwright, and View Transitions.
- Rendered public, commerce, authentication, account, order, and representative admin surfaces.
- Baseline screenshots at 375, 768, 1024, and 1440 pixels under `.superpowers/sdd/2026-08-29-propeptiq-ui-refinement-v4/baseline/`.
- Existing Vitest and Playwright coverage, including keyboard navigation, reduced motion, 200% zoom proxies, horizontal overflow, and Axe.

## Confirmed strengths

1. The canvas/ink/moss palette, Newsreader/Geist type pairing, fine rules, and low-shadow record surfaces already establish a recognizable identity.
2. The Proof Rail is a strong signature relationship and preserves the correct material → method → lot → COA order without inventing missing facts.
3. The public shell is responsive, mobile navigation traps/restores focus correctly, and tested routes do not horizontally overflow at the binding widths.
4. Browse-only records remain price-free and evidence-bound. The audited branch exposes 56 owner-supplied product families and 103 supplied configurations through the validated publication path.
5. Private account/admin routes preserve their capability and owner-scope boundaries in the presentation layer.

## Confirmed problems

### P0 — accessibility and truth-state clarity

- Axe reports a serious contrast failure for the moss eyebrow on the tinted active-program section (`4.39:1`, below the required `4.5:1`).
- The homepage renders a catalog-highlights heading and empty list when no approved products exist, creating an unexplained dead band in fail-closed mode.
- Public navigation has no visible/current-route state; account/admin links expose `aria-current` but do not receive a distinct shared treatment.

### P1 — hierarchy and brand cohesion

- Homepage composition is clean but sparse: the count panel is visually detached, equal-sized product cards read as a generic grid, and documentation/research positioning lacks a distinct editorial movement.
- Header branding renders a full lockup inside a symbol-sized square and repeats the wordmark as text, making the mark too small at desktop widths.
- Authentication routes feel disconnected from the public product because they lack a shared branded access shell and a clear route back.
- Product, cart, quality-record, account, and admin surfaces use the same record-card treatment at very different information densities, flattening hierarchy.

### P2 — interaction and state polish

- Card hover emphasis has no equivalent `:focus-within` treatment.
- Empty, warning, unavailable, and loading states are implemented with overlapping one-off patterns rather than a small semantic primitive set.
- The footer has a strong inverse surface but an undifferentiated link list.

## Baseline verification

| Check | Result before UI edits |
|---|---|
| Workspace boundary | Passed |
| TypeScript | Passed after removing the interrupted-install artifact from discovery |
| Public Playwright suite | 16 passed, 1 failed on the confirmed contrast defect |
| Unit suite | 1 pre-existing non-UI failure, 1395 passed |
| Lint | 1 pre-existing error and 1 warning in `src/auth/local-growth-driver.ts` |
| Horizontal overflow | None at tested public widths |
| Mobile Sheet keyboard behavior | Passed |

The unrelated auth-composition test and local-growth-driver lint findings are baseline defects, not evidence of UI-refinement regressions.

## Refinement decisions

- Keep the approved colors and fonts. Do not adopt generic liquid-glass, neon, safety-orange, or alternate-font recommendations.
- Add subtle record/recessed surface levels, readable tinted-surface labels, shared active navigation, and consistent spacing tokens.
- Prefer server-rendered composition. Keep Client Components narrowly scoped to cart, search/filter, Sheet, forms, and other real interactions.
- Use existing owner-supplied imagery and CSS geometry only. Do not imply a molecular structure or add external/hotlinked media.
- Preserve all route, data-authority, security, research-use, cart, checkout, and admin semantics.
- Treat `/catalog` and `/catalog/items/[slug]` as the current price-free browse family during this visual pass. Do not invent prices, availability, lots, or evidence to resolve documentation ambiguity.
