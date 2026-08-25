# PROPEPTIQ LABS Design System

**Status:** Proposed design direction; implementation must preserve the compliance rules in this file.

**Project type:** Compliance-first B2B research-materials catalog and operations application.

## Design intent

PROPEPTIQ LABS should feel exact, calm, and document-led. The visual system borrows only abstract presentation patterns from the audited reference sites: generous whitespace, a restrained clinical palette, prominent technical records, direct navigation, and clear lot/COA relationships. It must not reuse their branding, assets, product claims, pricing, medical categories, or sales language.

The interface has two modes:

- Public/editorial: quiet, light, research-document presentation.
- Authenticated operations: denser shadcn/ui surfaces for applications, compliance decisions, catalog records, orders, and reconciliation.

## Principles

1. Evidence before persuasion. Every product fact must point to a verified record.
2. Status is explicit. Unknown, blocked, and manual-review states are never styled as success.
3. No lifestyle or human-outcome imagery. Use abstract laboratory forms, document motifs, and actual approved product media only.
4. No fabricated trust badges, laboratory marks, certifications, purity values, reviews, testimonials, scarcity, promotions, or shipping promises.
5. Compliance gates are visible at the point of action, not hidden in footer copy.

## Color tokens

| Role | Value | Use |
|---|---:|---|
| Canvas | `#F6F7F4` | Main page background |
| Surface | `#FFFFFF` | Cards, tables, forms |
| Ink | `#101512` | Primary text and strongest controls |
| Muted ink | `#52605A` | Secondary copy; maintain WCAG AA contrast |
| Moss | `#56705D` | Primary accent and approved states |
| Moss soft | `#DDE7DF` | Quiet accents and selected surfaces |
| Slate | `#34453E` | Operational navigation |
| Review | `#9A6700` | Manual-review states |
| Blocked | `#A53A36` | Blocked/rejected/error states |
| Unknown | `#5F6670` | Unknown and unconfigured states |
| Border | `#DCE1DD` | Rules and input borders |

Foundational surfaces use semantic shadcn tokens. Status colors are reserved for status meaning; color is never the only status indicator.

## Typography

- Display and editorial headings: **Newsreader**, weights 500–600.
- Interface and body text: **Geist Sans**, weights 400–650.
- Maximum of two font families.
- Body: `clamp(1rem, 0.97rem + 0.12vw, 1.0625rem)`, line-height 1.5.
- Reading measure: 58–72 characters; never exceed 90.
- Display: `clamp(2.75rem, 6vw, 6.5rem)`, line-height 0.94–1.02.
- Section headings: `clamp(1.75rem, 3vw, 3rem)`, line-height 1.05–1.15.
- Operational labels may use uppercase only when shorter than one line, with `0.08em` letterspacing.
- Use real curly apostrophes/quotes and true en/em dashes in visible copy.
- Numeric tables, lot numbers, money, and timestamps use tabular figures.

## Layout

- Public max width: 90rem, with 1rem mobile and 2rem desktop gutters.
- Editorial text max width: 68ch.
- Operational max width: 100rem.
- 8px base spacing rhythm.
- Public page sections: 5–8rem vertical spacing on desktop, 3.5–5rem mobile.
- Cards: 14px radius; controls: 999px for short primary actions or 10px for form controls.
- Use whitespace and subtle 1px borders before shadows. Shadows remain low-contrast.

## Core components

### Public navigation

Logo/wordmark, Research Catalog, Quality Records, Researcher Access, Research-Use Policy, and account control. On mobile, use a shadcn Sheet. Do not present a cart to unauthenticated or ineligible users.

### Evidence strip

Use three factual system capabilities only: lot-linked documentation, verified-account access, and jurisdiction-aware ordering. These describe implemented controls, not unverified product quality.

### Catalog state

When no SKU is approved, show a designed empty state: “No research materials are currently approved for sale.” Offer researcher-access and policy links. Do not render sample product cards outside tests.

### Product record

Only render fields backed by the active product and lot record: identity, verified CAS number, formulation, supported purity result, analytical method, storage, lot/batch, and linked COA. Omit absent facts instead of substituting marketing copy.

### Eligibility summary

Present separate rows for buyer verification, catalog approval, product jurisdiction, payment-provider eligibility, tax, shipping, inventory/lot, and compliance clearance. Each row must show Allowed/Pass, Manual Review, Blocked, or Unknown with text and an icon.

### Operational surfaces

Use shadcn Card, Table, Badge, Tabs, Sheet, Dialog, AlertDialog, Alert, Skeleton, Label, Input, Select, and Tooltip. Destructive decisions use AlertDialog and require a reason. Empty/loading/error states receive dedicated components.

## Motion and transitions

- Motion communicates hierarchy or continuity only.
- Shared element transitions may connect an approved catalog card to its product record.
- Route-direction animation is reserved for list-to-detail navigation.
- Lateral tabs use a subtle fade or no animation.
- Timing: 160–260ms for controls, at most 360ms for shared elements.
- No scroll-jacking, parallax, perpetual motion, bouncing, or layout-shifting scale hovers.
- All motion has a `prefers-reduced-motion: reduce` equivalent that removes transforms and animation.

## Open Graph system

Use a Satori/`next/og` convention image at 1200×630. It may contain the PROPEPTIQ LABS wordmark, the phrase “Research materials, governed by evidence,” and abstract document/lot motifs. Product-specific previews must use only approved product media and verified record text; otherwise omit product imagery.

## Copy guardrails

Never use dosage, reconstitution, injection, treatment, weight-loss, bodybuilding, anti-aging, therapeutic, structure/function, or human/veterinary outcome language. Never use human-use reviews or testimonials. Never imply a disclaimer cures otherwise human-directed intent.

Preferred language:

- “For legitimate laboratory and research use only.”
- “Not for human or veterinary use.”
- “Access requires verified researcher or organization approval.”
- “Eligibility is evaluated for each product and destination.”
- “Unknown eligibility requires review and cannot proceed to checkout.”

## Responsive and accessibility gates

- Verify 375px, 768px, 1024px, and 1440px widths.
- Maintain 4.5:1 body-text contrast and visible keyboard focus.
- Provide semantic headings, landmarks, labels, descriptions, and error summaries.
- Use at least 44×44px touch targets where practical.
- Do not hide required disclosures behind hover.
- No horizontal scrolling at 375px.
- Animations must respect reduced motion.

## Page overrides

Page-specific deviations live in `design-system/pages/<route-name>.md`. An override may refine layout but may not weaken the compliance, accessibility, typography, or evidence rules in this master.
