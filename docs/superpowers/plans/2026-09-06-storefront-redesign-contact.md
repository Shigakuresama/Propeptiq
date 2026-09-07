# Storefront redesign and contact implementation

Base: origin/main baa1fe6. Scope: the user-supplied nineteen-part storefront request.
No production deployment, live charges, payment-setting changes, unsolicited mail,
invented facts, weakened safeguards, or edits to sibling worktrees.

## Tasks

1. Inspect current code and rendered pages, catalog and provider dependencies.
2. Implement server-backed contact form with Resend, validation, abuse protection,
   idempotency and truthful accepted-send feedback. Independent contact ownership.
3. Refine shared tokens, product cards, amount/quantity controls, bundle pricing,
   homepage showcase, brand motion, rewards, related carousel and footer.
4. Update permanent instructions, run functional and visual regression checks,
   review the full change set and record exact remaining dependencies.

## Evidence and decisions

- Current catalog exposes 56 distinct products; use an exact count, not "over 56".
- All existing bottle assets have documented AI provenance. Preserve the assets and
  their disclosures. Do not represent them as photography. Real-photo showcase
  is contingent on verified assets; ask for their path while continuing work.
- Tesamorelin is currently cataloged as Tesmorelin. Preserve exact catalog names
  and URLs pending an owner-approved identity correction.
- Existing QUANTITY_TIERS and automatic WINTER30 are the only pricing rules.
- Production purchasing requires missing owner/provider approval; no bypass.

## Ownership and interfaces

| Tasks | Shared boundary | Resolution |
| --- | --- | --- |
| Contact / storefront | /contact and shared tokens | Contact owns route, form, service, env and contact tests; storefront owns footer link and tokens. |
| Inspection / all | Current facts | Verify code and assets; distinguish missing configuration from implementation defects. |
| Cards / detail / bundles | PublicStorefrontPricingContext | Reuse resolvePublicVariantPrice and canAddPublicVariant. |
| UI / verification | Rendered contracts | Update assertions for intentional UI changes; preserve safety assertions. |

Each task is consistent with the supplied request. Reviewable local changes are
the deliverable; deployment is explicitly excluded.
