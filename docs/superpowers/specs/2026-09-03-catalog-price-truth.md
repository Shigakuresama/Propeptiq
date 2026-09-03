# Catalog metadata and price-label truth — Phase 1

Status: approved for implementation by the owner on 2026-09-03.

## Outcome and evidence

This bounded phase corrects catalog cards whose amount caption describes a different variant from the displayed price. At baseline `3571d7eeebe7ed66d3121e98c14b77998c2be80e`, `CatalogListingCard` summarizes every variant while `selectCardVariant` independently chooses a priced variant. This permits Tirzepatide's 5 mg caption to appear beside the 30 mg price. The same pattern affects Retatrutide and NAD+.

The same audit found numeric amounts parsed from display labels, popularity inferred from array position, and release dates copied from an audit timestamp. These are data-authoring problems, not verified business facts. The owner approved fixing these together, preserving the established brand and commerce safeguards.

## Binding contract

1. Preserve all 56 product identities and 103 variant identities, SKUs, slugs, image paths, public labels, package quantities, and the current explicit default-variant results. Do not alter the owner-pinned browse source or its publication fingerprint.
2. Preserve the 40 reviewed positive Amino-equivalent **ordinary one-vial base prices** and 63 pending zero-dollar rows, including their source URLs and observation timestamps. No competitor campaign is imported. WINTER30 remains automatic, 30%, and non-stacking.
3. Add an explicit amount field to the existing catalog decision configuration. Author values by the exact `(browseSlug, browseCode)` key from the existing owner record. The canonical projection reads this field; it must not parse an mg label, SKU, image, or display text to derive amount, price, identity, or provider mapping.
4. Preserve the existing amount meanings: a single stated positive mg/mcg/iu value has that exact numeric value and unit; composite descriptions and mL-only records remain `null`. Do not sum blend components or convert mL to mass. Missing, duplicate, or unexpected configured keys must fail validation rather than silently produce a different catalog.
5. Product `popularityRank` and `releasedAt` may be explicitly `null`. All current production-shaped records use `null` because no verified rank or release date was supplied. Non-null values retain existing positive-integer and valid-offset-ISO validation. Missing/undefined and malformed values are not aliases for null. Search retains its established deterministic alphabetical/ID fallback; no clock or input order substitutes for missing metadata.
6. Card selection has one pure authority, reused by discovery price sorting:
   - Honor `defaultVariantId` if it resolves to a non-unavailable variant with a positive displayed price under the current pricing context.
   - Otherwise select the lowest positive displayed effective unit price among eligible variants; keep the existing label-then-ID tie break.
   - If none has a positive displayed price, fall back only to the explicit default variant for pending/unavailable/local-zero presentation. Never silently use the first array entry.
7. The amount caption, standard price, sale price, percentage badge, availability, and price-sort value refer to that same selected variant. Render the selected amount or full selected label and its package quantity, e.g. `30 mg · 1 bottle`. Do not say `From 5 mg` beside a 30 mg price. Composite labels remain intact; pluralize bottle count correctly.
8. Multiple-variant ADD still requires the existing selector. Selection here is presentation, not permission to add an arbitrary variant. Do not change cart identity/merging, quantity tiers, checkout, payment gates, server reconciliation, tax, shipping, auth, or provider behavior.
9. Keep current image dimensions, grid geometry, keyboard semantics, visible focus, and reduced-motion behavior. No new dependency, UI library, CMS, external integration, schema migration, or production capability switch belongs in this phase.

## Acceptance

- The actual configured Tirzepatide card associates 30 mg / one bottle with $59.99 standard and $41.99 WINTER30 price; Retatrutide associates 10 mg with $69.99 / $48.99; NAD+ associates 500 mg with $69.99 / $48.99.
- The explicit-default, fallback, ties, pending-zero, unavailable, no-default-match, scoped promotion, and no-mutation cases have focused behavior tests.
- Numeric amount literals survive display-text changes without reinterpretation; null units/blends remain null. IDs/SKUs/prices and owner browse fingerprint are unchanged.
- Null rank/release metadata survives binding/public/index projection; invalid non-null values still fail. Most-popular/newest queries retain stable fallback and active query state.
- Browser regressions exercise the current local catalog at phone and desktop sizes, assert the exact label/price associations, verify no overflow and unchanged image reservation, and preserve multi-variant chooser behavior.
- Full unit, relevant integration, lint, typecheck, workspace boundary, focused browser, production build, and artifact scan results are recorded against the candidate. Unrun or unavailable lanes are not passes.
- The owner guide accurately names the edit points, selected-variant policy, null metadata meaning, 40/63 coverage, and remaining payment/content launch gates.

## Scope after this phase

The wider approved storefront work remains open. Later independently reviewed phases cover complete local catalog/cart previews, header and product-page refinement, approved content/related products, the newsletter provider/consent integration, and production database/payment reconciliation. This phase does not claim those items complete or authorize invented content, stock, credentials, or provider approval.
