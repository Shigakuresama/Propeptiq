# PROPEPTIQ Rewards, Referrals, and Affiliate Experience

**Status:** Proposed design contract. No program described here is live until a matching active server policy exists.

**Date:** 2026-08-27

## Outcome

Add a coherent growth layer to PROPEPTIQ without replacing the approved `desktop-v3` / `responsive-v2` visual system or weakening the existing research-only commerce boundaries. The experience should make the catalog easier to explore, reward legitimate repeat research purchases, let customers share neutral research sets, and support a separately governed cash affiliate program.

## Evidence and inspiration

The current PROPEPTIQ public site is calm, legible, and evidence-oriented, but its homepage is sparse, its 56-exact-name / 103-variant browse catalog needs stronger discovery tools, and account navigation does not expose rewards or referrals. The live 375px layout also needs a release check that the full logo lockup remains uncropped after deployment.

AminoClub currently exposes several useful growth patterns: a visible partner program, 30-day referral attribution, a tracked partner dashboard, points, membership tiers, shareable research bundles, subscription boxes, bulk ordering, and evidence links. See its [homepage](https://www.aminoclub.com/), [partner program](https://www.aminoclub.com/us/affiliate), [research bundles](https://www.aminoclub.com/us/bundles), [points page](https://www.aminoclub.com/us/buy-points), and [membership page](https://www.aminoclub.com/us/membership).

PROPEPTIQ will adapt the mechanisms, not AminoClub's identity, layouts, assets, copy, percentages, or product claims. In particular, it will not copy crowded sale bars, unsupported purity/accreditation claims, medical-sounding product categories, human-use implications, or always-on urgency.

## Binding visual direction

- Preserve the off-white canvas, near-black ink, restrained moss, Newsreader headings, Geist Sans interface text, fine rules, low-shadow record surfaces, and Proof Rail.
- Make the homepage more useful through editorial modules, not through a coupon-wall treatment.
- Keep one primary action per section. A real, active promotion may add one restrained announcement strip beneath the permanent research-use restriction bar.
- Reduce the desktop hero's visual dominance enough that the catalog or evidence module begins within the first viewport at 1440px. Keep a one-column hero at 375px.
- Use tabular figures for balances, points, thresholds, and commissions. Never rely on color alone for pending, available, reversed, blocked, or paid states.
- Use quiet progress indicators and ledger language. Do not use confetti, casino-like animation, fake scarcity, or infantilizing badges.
- The public Rewards science scene may use a slow decorative orbit of at least 18 seconds when it communicates no program value, cannot receive focus, and stops completely for reduced-motion preferences. Entrance motion remains within the shared 160–260ms envelope.
- Protect the header brand width at 375px and 200% zoom. The logo image must remain uncropped; the text lockup may shorten to `PROPEPTIQ` only at the existing mobile breakpoint.

## Information architecture

### Public navigation

Keep the primary navigation compact:

1. Catalog
2. Quality Records
3. Rewards
4. Research-Use Policy

Put `Partner Program` in the account menu and footer rather than crowding the desktop header. Keep cart and sign-in/account actions in the header.

### New routes

| Route | Purpose | Availability |
|---|---|---|
| `/rewards` | Plain-language points and referral explanation from the active policy | Public; truthful inactive state when no policy is active |
| `/partners` | Affiliate overview, terms summary, and application entry | Public; application requires a provider-verified identity |
| `/account/rewards` | Available/pending points, redemption rules, and immutable ledger | Authenticated owner only |
| `/account/referrals` | Personal code/link, qualified conversions, rewards, and shared research sets | Active buyer only |
| `/account/partner` | Affiliate application or approved partner dashboard | Verified account owner only |
| `/research-sets` | Build a neutral shareable set from active public products | Active buyer only |
| `/sets/[code]` | Public server-resolved shared set with current product facts | Public, read-only; inactive/missing products are omitted |
| `/rewards/terms` | Versioned customer rewards/referral terms | Public |
| `/partners/terms` | Versioned affiliate terms and disclosure rules | Public |

## Page and component design

### Homepage

Use this order:

1. Research-use restriction bar.
2. Optional active-promotion strip with a real end time only when the promotion record has one.
3. Editorial hero with a smaller desktop display scale, catalog CTA, and one record-backed visual or catalog summary.
4. Proof Rail showing material identity → analytical method → lot/batch → COA state.
5. Searchable catalog highlights chosen by an explicit admin-curated list, never by fabricated popularity.
6. A compact `Earn points / Refer a lab / Share a research set` explainer sourced from active growth policies.
7. Quality-record callout.

When commerce or growth policies are inactive, omit their modules rather than showing invented values.

### Catalog and product records

- Add a persistent labeled search field and compact filters for exact source name, source code, and package unit. Do not invent therapeutic categories.
- Keep 56 exact-name cards and all 103 owner-supplied variants available in browse-only publication mode. Prices and growth actions remain absent in that mode.
- For production database products, show active server price, available package form, active promotion summary, and evidence state.
- Product details may show `Earn N points` only after the server has projected a real price and active loyalty policy.
- Related records come only from active cross-sell records. Shared-set suggestions must not imply a scientific protocol or outcome.

### Cart and checkout

- Show merchandise, promotion, referral benefit, points redemption, tax, shipping, and final total as separate server-authoritative rows.
- Accept only product IDs, quantities, destination, promotion identifiers, a referral code, and requested points from the browser. Ignore browser-provided prices, percentages, balances, and commission data.
- Label points as pending until the qualifying lifecycle event. Explain the exact amount that will be earned on this order.
- A referral first-order benefit competes with other acquisition promotions; the server applies the greatest eligible customer discount. Points redemption may stack within its cap.
- Affiliate commission never changes the checkout total and is never disclosed to the referred buyer.

### Rewards account

The first panel shows:

- Available points and USD-equivalent value.
- Pending points.
- A labeled progress bar toward the minimum redemption.
- The active earn and redemption rules.

The ledger lists date, reason, order/reference, pending delta, available delta, and resulting balance. Reversed entries remain visible. A blocked buyer may read the ledger but may not redeem points or create new referral links.

### Customer referrals

Every active buyer receives one stable, revocable referral code automatically. The dashboard provides:

- A copyable first-party link with no email, name, or other personal data in the URL.
- Current referred-customer benefit and referrer reward.
- Counts for attributed, pending, qualified, and reversed referrals.
- A concise list of conversions without exposing another buyer's email, address, order contents, or payment data.
- A neutral shared-research-set builder using only product IDs and quantities.

Customer referrals do not require staff approval.

### Affiliate program

Keep the application lightweight: verified email, public channel URL or handle, promotion method, and acceptance of the current affiliate terms. Do not require routine organization documents or uploads. An administrator approves cash affiliates because the program creates payout and marketing obligations.

The partner dashboard shows clicks, qualified orders, pending commission, approved commission, paid commission, attribution window, and payout threshold. It does not expose referred-customer identity or order details.

Payout execution is outside the app in V1. The application records an approved payout amount and an external payment reference after the owner completes any required tax/payment onboarding. Do not assume Stripe Connect or any other payout provider is approved.

## Proposed V1 economics

These are exact launch-policy proposals for implementation and synthetic tests. They remain `draft` and invisible in production until the owner validates margin impact and activates the records.

### Points

- `100 points = $1.00` of order credit.
- Earn `2 points per $1.00` of eligible net merchandise spend.
- Eligible spend excludes tax, shipping, refunded amounts, ordinary discounts, referral discounts, and redeemed points.
- Minimum redemption: `500 points` (`$5.00`).
- Maximum redemption: `25%` of the post-promotion merchandise subtotal.
- Points do not expire in V1.
- Points cannot be purchased, transferred, redeemed for cash, or used to pay tax or shipping.
- Earned points become pending after verified payment and available after delivery. Verified refunds, chargebacks, and reversals append compensating ledger entries.

### Customer referral

- Attribution window: `30 days`, last eligible referral click.
- Referred customer's first eligible order: `10%` off, capped at `$25.00`.
- Referrer reward: `5 points per $1.00` of the referred order's eligible net merchandise, capped at `2,500 points`.
- Reward becomes available after the referred order is delivered.
- One referral reward per new buyer. Self-referrals, duplicate buyer accounts, refunded orders, and chargebacks are ineligible.

### Cash affiliate

- Attribution window: `30 days`, last eligible affiliate click.
- First eligible order commission: `10%` of eligible net merchandise.
- Reorder commission: `5%` for `180 days` after the first qualified order.
- Commission becomes eligible for approval `30 days` after delivery and remains reversible for verified refunds or chargebacks.
- Minimum payout: `$50.00`; payout batches run monthly outside the app.
- No lifetime commission promise, instant cash approval, or `$1` payout threshold in V1.

## Attribution and stacking rules

1. A signed, first-party, `HttpOnly`, `Secure`, `SameSite=Lax` cookie stores only program type, code, issued time, expiry, and signature.
2. A new explicit eligible referral click replaces the prior referral of the same program type. Customer-referral and affiliate attribution cannot both earn on the same order.
3. At first qualified order, the server binds attribution to the buyer and snapshots the policy version.
4. The best eligible customer acquisition discount is applied. A normal promotion does not change the attribution record, but only one acquisition discount is applied.
5. Points redemption is a separate capped order credit and is reserved atomically before provider checkout.
6. Affiliate commission and referral rewards are calculated from net merchandise after all customer discounts and point redemption; tax and shipping are excluded.
7. A shared research set may carry its owner's customer-referral code, but the set itself cannot define a discount or commission.

## Adaptation decisions

| AminoClub pattern | PROPEPTIQ decision |
|---|---|
| Prominent partner program and 30-day attribution | Adopt with a quieter public page and privacy-preserving dashboard |
| Real-time referral dashboard | Adopt counts and financial states; omit customer PII |
| Points and tier cards | Adopt points ledger and redemption progress; defer paid/tiered membership |
| Shareable research bundles | Adapt as neutral shared research sets with server-resolved facts |
| Buy points | Do not implement in V1 because it creates stored-value, accounting, and chargeback complexity |
| Lifetime recurring cash commission | Replace with a bounded 180-day reorder window |
| Instant affiliate approval | Customer referrals are automatic; cash affiliates require one admin approval |
| Always-on sales/countdowns | Render only from a real active promotion and real end time |
| Purity/accreditation guarantees and medical-sounding categories | Never copy; analytical claims require exact active lot evidence and all public copy passes content policy |

## Security, content, and operational boundaries

- Existing buyer, destination, inventory, payment-provider, refund, and fulfillment controls remain server-side.
- Referral, reward, affiliate, and shared-set mutations require same-origin/CSRF enforcement and database-backed rate limits.
- No device fingerprinting or broad surveillance in V1. Use delayed qualification, self-referral rejection, idempotency, velocity limits, and manual affiliate payout review.
- Shared-set labels, affiliate profile text, promotion names, and all public strings pass the existing prohibited-use and unsupported-claim scanner.
- Affiliate terms require clear compensation disclosure and prohibit dosing, administration, treatment, human/veterinary outcome, or unsupported quality claims.
- Customer referral and affiliate terms are versioned; acceptance records store the exact version and server-computed SHA-256 content hash.
- The FDA/FTC/Stripe boundaries in the completed lightweight-commerce plan remain binding. A research-use disclaimer does not authorize surrounding human-use evidence or unsubstantiated advertising.
- Growth programs remain disabled when the real commerce catalog, approved destination policies, tax/shipping, fulfillment, payment-provider acceptance, or a production database is unavailable.
- Email is a convenience only. Rewards, approvals, and payout status must remain readable in the account dashboard when the production email sink is unavailable.

## Responsive and accessibility acceptance

- Verify 375px, 768px, 1024px, 1440px, 200% zoom, keyboard-only navigation, reduced motion, and no horizontal overflow.
- Keep all practical targets at least 44×44px and explanatory text at least 16px.
- Progress indicators expose current value, maximum, and text equivalent.
- Copy-link actions announce success without moving focus unexpectedly.
- Tables reflow to labeled record cards on narrow screens; do not require horizontal scrolling for core facts.
- Pending/available/reversed/paid states include text and icons, not color alone.
- Header and account navigation expose every new route through a labeled Sheet through 1024px.

## V1 exclusions

- Buying points or gift-card-like stored value.
- Paid membership tiers.
- Automatic bank payouts or Stripe Connect.
- Lifetime commissions.
- Open-ended free-form public bundle descriptions.
- Device fingerprinting.
- Testimonials, popularity claims, or quality guarantees without real substantiation.
- Enabling growth offers against the owner-supplied browse-only PDF catalog; that source remains price-free and non-purchasable.
