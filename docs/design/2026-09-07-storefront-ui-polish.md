# Storefront UI refinement

User-approved scope: implement suggestions 1, 2, 3, 5, 6, 7 and 8 from the storefront UI/UX review. Suggestion 4 (unavailable amount styling) is explicitly excluded.

## Design brief

- Keep the mobile logo, search, cart, account and navigation on a single row at 375px, retaining practical 44px controls and narrow/zoomed reflow.
- Show the selected unit price and unit savings immediately beneath the product name. Keep the full selection total in the purchase summary and bundle selection before quantity/cart actions.
- Increase bundle bottle imagery, remove repeated per-bottle price text, and distinguish the exact selected preset with a stronger border.
- Present compound information as a short introduction and compact facts, with source references in native disclosures.
- Let the finite molecular logo animation carry the brand motion while the sale banner stays quiet.
- Retain Newsreader/Geist, introduce warm ivory around existing photography, and add an original decorative bond motif to the product frame. The motif is abstract decoration, not a scientific structure diagram.
- Confirm successful clipboard and cart actions immediately and visibly; preserve honest failure feedback and keyboard/reduced-motion behavior.

## Boundaries

Use the existing authoritative prices, stacked discounts, product facts, source images and cart/checkout safeguards. No provider configuration, contact changes, email delivery tests, AI disclosure or unavailable amount-control changes belong to this pass. The current release worktree is isolated from the dirty canonical checkout and UI-refinement sibling.

## Validation

Run focused component checks, lint, type checking and the production build/artifact gates. Check real desktop, tablet, mobile and zoomed product/header layouts; verify price/quantity/bundle synchronization, cart and clipboard feedback, source disclosures, keyboard focus and reduced motion. Review the diff independently before merge and verify the deployed public pages.
