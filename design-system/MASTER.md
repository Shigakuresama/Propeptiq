# PROPEPTIQ LABS Design System

**Binding visual baseline:** approved desktop-v3.

**Binding behavioral handoff:** `responsive-v2`. It retains desktop-v3 styling while superseding the earlier public-access behavior.

## Direction

Use a calm archival/editorial system: off-white canvas, near-black ink, restrained moss accents, Newsreader headings, Geist Sans interface text, fine rules, low-shadow record surfaces, generous whitespace, and the Proof Rail. Do not copy another business's identity, assets, catalog, prices, or claims.

## Public commerce behavior

- Public visitors may browse active products, prices, and truthful promotions and may build an anonymous cart.
- The cart stores product identifiers and quantities only. It never represents authoritative price, discount, availability, tax, shipping, or eligibility.
- Account creation and the research-use checkout attestation occur at checkout. Preserve the anonymous cart through sign-in.
- `/research-use-policy` is canonical. A future `/research-use` route may redirect to it and may not carry independent policy copy.
- Desktop-v3's account-led prototype copy is not a behavioral requirement. `responsive-v2` governs route access and calls to action.

## Truthful content

- No human or veterinary outcome, dosing, administration, reconstitution, treatment, structure/function, testimonial, or implied-use positioning.
- Do not invent products, prices, purity, stock, lots, suppliers, laboratories, certifications, reviews, shipping promises, or provider acceptance.
- Product facts render from active server records. Purity, sterility, testing, laboratory, accreditation, or similar analytical claims require the corresponding active lot evidence.
- Discounts, bundles, subscription offers, loyalty, and cross-sells may render from active server records. Scarcity and countdown copy requires real inventory or an actual promotion end time.
- The overall page composition must not imply a claim that its words cannot support.

## Color and type

| Token | Use |
|---|---|
| Canvas `#F4F1E8` | Page background |
| Ink `#171915` | Primary text and dark surfaces |
| Moss `#66715B` | Restrained accents and focus-adjacent emphasis |
| Rule `#C9C5B8` | Dividers and record boundaries |
| Warning `#9A6700` | Review state with text/icon |
| Danger `#A33A31` | Blocked/error state with text/icon |

Use Newsreader 500–600 for editorial headings and Geist Sans for body/interface text. Body text is at least 16px, headings wrap without hyphenation, and numeric records use tabular figures.

## Proof Rail

The only planned public data relationship is an ordered list: material identity → analytical method → lot/batch → COA state. Each node shows a visible label and state. A link appears only when an approved destination exists. The empty state contains no fictional values.

## Responsive and accessible behavior

- 375px: 16px gutters, one-column hero, vertical Proof Rail, 44×44px practical touch targets, and a labeled keyboard-operable navigation sheet.
- 768px: 24px gutters; stack or use two columns only when labels and reading order fit.
- 1024px: full navigation only when it fits at 200% zoom; use the approved desktop grid.
- 1440px: stop content at the 90rem maximum and expand whitespace.
- Provide a skip link, sequential headings, visible focus, WCAG AA essential contrast, Escape/focus restoration for overlays, reduced-motion behavior, DOM order matching visual order, and no horizontal overflow.

Page exceptions may refine composition but may not weaken this content, commerce, or accessibility contract.
