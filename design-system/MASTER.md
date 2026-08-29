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

## Rewards, referrals, and affiliate contract

- Public navigation is Catalog, Quality Records, Rewards, and Research-Use Policy. Partner Program belongs in the account menu and footer; cart and account actions remain in the header.
- New routes are `/rewards`, `/partners`, `/account/rewards`, `/account/referrals`, `/account/partner`, `/research-sets`, `/sets/[code]`, `/rewards/terms`, and `/partners/terms`, with access and truthful inactive states defined by the binding growth design.
- The homepage order is research-use restriction bar; optional active-promotion strip only with a real end time; editorial hero; Proof Rail; admin-curated catalog highlights; the compact Earn points / Refer a lab / Share a research set explainer; and quality-record callout. Omit inactive commerce or growth modules rather than inventing values.
- The owner-supplied browse-only PDF catalog remains price-free and non-purchasable. It may expose the 53 exact-name cards and all 103 owner-supplied variants in browse-only publication mode; active production database products may expose server-recorded price, package form, promotion, evidence, and growth actions.
- V1 proposed production records begin as `draft` and remain invisible until the owner validates margin impact and activates them. Points are `100 points = $1.00`, earn `2 points per $1.00` of eligible net merchandise spend, redeem from `500 points` (`$5.00`) up to `25%` of the post-promotion merchandise subtotal, and do not expire. Points exclude tax, shipping, refunded amounts, ordinary discounts, referral discounts, and redeemed points; they cannot be purchased, transferred, redeemed for cash, or used for tax or shipping.
- Customer referral attribution is `30 days`, last eligible referral click; the referred customer's first eligible order receives `10%` off capped at `$25.00`; the referrer earns `5 points per $1.00` of eligible net merchandise capped at `2,500 points`; and the reward becomes available after delivery. Each active buyer receives one stable, revocable code automatically, with one referral reward per new buyer. Self-referrals, duplicate buyer accounts, refunds, and chargebacks are ineligible.
- Cash affiliates use `30 days` last eligible affiliate click attribution, `10%` first eligible order commission, and `5%` reorder commission for `180 days` after the first qualified order. Commission is eligible for approval `30 days` after delivery, remains reversible for verified refunds or chargebacks, has a `$50.00` minimum payout, and is batched monthly outside the app. Cash affiliates require verified identity and one administrator approval; production records begin as `draft`.
- Explicit V1 exclusions are buy points, paid tiers, lifetime commission, automatic payouts, instant affiliate approval, medical category positioning, fake popularity, unsupported trust claims, open-ended public bundle descriptions, device fingerprinting, and enabling growth offers against the browse-only PDF catalog. Payout execution remains outside the app; no Stripe Connect or other provider is assumed approved.

### Growth source note

Pattern research used the official [AminoClub homepage](https://www.aminoclub.com/), [partner program](https://www.aminoclub.com/us/affiliate), [research bundles](https://www.aminoclub.com/us/bundles), [points page](https://www.aminoclub.com/us/buy-points), and [membership page](https://www.aminoclub.com/us/membership). These are pattern references only, not PROPEPTIQ production data or legal precedent. PROPEPTIQ does not copy AminoClub's identity, layouts, assets, copy, percentages, or product claims.

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
