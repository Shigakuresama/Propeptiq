# Responsive Public UI Handoff

**Status:** Binding implementation contract.

**Handoff:** `responsive-v2`.

**Visual source:** approved Superdesign desktop draft `d5bd0bcf-c086-499d-904c-4eb8581d2bb4`, version `3` (`desktop-v3`).

`responsive-v2` retains desktop-v3's off-white/ink/moss, Newsreader/Geist, archival/editorial composition, low-shadow records, and Proof Rail. It supersedes earlier public-access behavior: active catalog products, server prices, truthful promotions, and the cart are public; a research-use account and checkout attestation are required at checkout.

## Public route contract

| Route | Behavior | Primary actions |
|---|---|---|
| `/` | Research-use positioning, active catalog highlights only when real records exist | Browse catalog, view cart |
| `/catalog` | Public active product/price/promotion list; truthful empty state when none exist | View product, add to cart |
| `/catalog/[slug]` | Public active product projection, evidence-backed claims, related records | Add to cart |
| `/cart` | Anonymous product IDs/quantities; server preview reloads authoritative facts | Continue shopping, begin checkout |
| `/quality-records` | Public approved lot/COA projections and truthful empty/lookup states | Open available record |
| `/research-use-policy` | Canonical research-use restrictions and purchaser responsibilities | Continue to catalog/cart |

A future `/research-use` route may only redirect to `/research-use-policy`. Account/order routes require authentication. Checkout preserves the anonymous cart through Clerk sign-in and then collects age 21+, structured purpose, and the current versioned attestation.

The growth routes are `/rewards` (public points/referral explanation with a truthful inactive state), `/partners` (public affiliate overview and application entry), `/account/rewards` (authenticated owner-only points and immutable ledger), `/account/referrals` (active buyer referral code, conversions, rewards, and shared research sets), `/account/partner` (verified owner application or approved dashboard), `/research-sets` (active-buyer neutral set builder), `/sets/[code]` (public read-only server-resolved set), `/rewards/terms`, and `/partners/terms`. Partner Program stays in the account menu and footer.

## State ownership

- **Loading:** structural skeletons contain no invented product-like facts.
- **Empty:** say no active records are currently available and offer stable navigation.
- **Public-data error:** safe retry and correlation/reference text without dependency or secret detail.
- **Blocked/unavailable:** deny checkout with concise reason codes; do not create review work.
- **Review:** appears only for buyer status or destination result explicitly equal to `review`; explain that the current exact snapshot requires a decision without promising outcome or timing.
- **Stale cart:** preserve requested product IDs/quantities but show server-reloaded changes and require confirmation; never honor stale price/discount/availability.

## Responsive composition

| Viewport | Navigation | Commerce and records | Spacing/type |
|---|---|---|---|
| 375px | Wordmark, cart count, account/sign-in, labeled menu button; Sheet contains all routes and research-use restriction | One column; sticky cart summary only when it does not obscure content; vertical Proof Rail | 16px gutters, body ≥16px, practical 44×44px targets |
| 768px | Keep Sheet until all labels fit without collision | One or two columns; cart summary may sit below items | 24px gutters, 58–72 character reading measure |
| 1024px | Full navigation only when it fits at 200% zoom | Approved desktop 7/5 or 6/6 grid; horizontal ordered Proof Rail | 32px gutters, fluid display type |
| 1440px | Full navigation in shared container | Stop at 90rem; expand whitespace rather than cards/type | 32px gutters, 80–128px section rhythm where appropriate |

Growth content follows the same responsive contract: tables reflow to labeled record cards, all practical targets are at least 44×44px, text is at least 16px, and pending/available/reversed/paid states use text and icons rather than color alone. Verify 375px, 768px, 1024px, 1440px, 200% zoom, keyboard-only navigation, reduced motion, and no horizontal overflow for the new routes and homepage modules.

Breakpoints are content-driven. DOM/reading/tab order never changes to imitate a visual layout.

## Navigation and cart

- First focusable control is “Skip to main content.”
- Wordmark returns home. Primary routes are Catalog, Quality Records, Rewards, and Research-Use Policy. Cart and Account/Sign in remain header actions.
- The mobile trigger has an accessible name and expanded state; the Sheet traps focus, closes on Escape, restores trigger focus, and uses keyboard-operable links.
- Research-use restriction is visible in header/Sheet context, not footer-only.
- Cart count is announced concisely after add/remove and is not color-only. Quantity controls have persistent names and validation.
- Local cart contains only product IDs/quantities. Server responses own names, prices, promotions, availability, totals, destination, tax, and shipping.

## Proof Rail

Use one `<ol aria-label="Evidence relationship">` with four `<li>` elements in this DOM order: material identity, analytical method, lot/batch, COA state. Every node has visible label and state. Links appear only for real approved destinations. The rail is not progress navigation and has no fictional values.

## Motion, content, and accessibility

- Use 160–260ms color/opacity transitions without layout-shifting scale. Reduced motion removes transforms/shared-element animation.
- No human/veterinary outcomes, dosing, administration, reconstitution, treatment positioning, or misleading overall impression.
- Product/analytical facts require active server records and corresponding evidence; promotions/urgency require active server records and real inventory/end time.
- Meet WCAG AA essential contrast, visible focus, sequential headings, persistent form labels, inline errors plus summary, appropriate image alternatives, and no restriction hidden behind hover/collapse.
- Verify 375px, 768px, 1024px, 1440px, keyboard-only navigation, reduced motion, 200% zoom, loading/empty/error/stale-cart states, and no horizontal overflow.
- The homepage growth sequence follows the binding order after the Proof Rail: admin-curated catalog highlights, then the compact `Earn points / Refer a lab / Share a research set` explainer, then the quality-record callout. Inactive growth or commerce policies omit their modules.

## Supersession record

The user approved desktop-v3 and the earlier responsive adaptation on 2026-08-24. `responsive-v2` preserves that visual approval and replaces behavior only. Prototype copy implying an account-first catalog or unavailable public cart is historical design context, not an implementation requirement. Product, destination, catalog, tax/shipping, fulfillment, and provider launch facts remain external/record-backed and fail closed when absent.
