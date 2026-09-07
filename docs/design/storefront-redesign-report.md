# Storefront redesign report — 2026-09-06

Branch: **feat/storefront-redesign-contact**, isolated from origin/main at **baa1fe6**.
No deployment, production database migration, merchant setting change, charge, or
provider email was performed.

## Result

Shared white/teal surfaces, readable uppercase typography, consistent cards with
working variant controls, compact purchasing, approved quantity bundles, a related
carousel, finite motion, revised public copy, a refined footer, and a server-integrated
Contact Us page are implemented.

**Overall status: partially complete.** Real photography, approved guarantee terms,
live purchasing prerequisites, verified payment methods, and contact activation
remain external dependencies. Existing bottle assets are preserved. Per the owner's
follow-up request, the customer-facing AI disclosure has been removed.

## Requirement-by-requirement status

| # | Requirement | Status | Evidence and remaining work |
|---|---|---|---|
| 1 | Inspect first | Completed | Read applicable instructions and current architecture; inspected production home/product/rewards and Aminoclub home/product patterns. |
| 2 | Preserve assets and safeguards | Completed | No public image asset changed/deleted. No pricing, promotion, inventory, authentication, eligibility or checkout policy weakened. |
| 3 | White/teal theme and headings | Completed | Shared globals.css variables, responsive uppercase type and wrapping; full-page accessibility and containment checks across six sizes. Image pixels preserved. |
| 4 | Shared cards | Completed | Equal grid columns and image containers; fixed overriding 40px padding; name/image links; native variant dropdown; selected ID/price/cart payload; unavailable options disabled; shared 16px action margin. |
| 5 | Trending feature | Partially completed | Replaced oversized statistics/visual block with editorial links to Retatrutide, canonical Tesmorelin, and HGH. Exact distinct count is 56: “56 products in the catalog.” Approved real photos missing. |
| 6 | Photography and brand motion | Partially completed | Logo motion enhanced and sampled in motion; reduced motion honored. Above-fold real-photo compositions blocked by missing photographs. |
| 7 | Homepage wording | Completed | Removed empty documentation philosophy/proof block and server architecture paragraph. Preserved concise restrictions and policy link. Options are called amounts in FAQ/product copy. |
| 8 | Why choose cards | Completed | Six original geometric SVG motifs, coordinated teal/white style, hover/focus effects and reduced-motion behavior. Copy describes implemented functionality. |
| 9 | Rewards | Completed | Responsive REWARDS title and shared uppercase treatment; public record/signal jargon removed. Values/actions still require active server projections. |
| 10 | WINTER promotion | Completed | Existing WINTER30 / 30% configuration; separate code pill and finite highlight sweep. No invented deadline or stacking. |
| 11 | Guarantee | Blocked | No approved guarantee policy found. No unsupported guarantee claims or empty control published. Approved terms required before adding its popover. |
| 12 | Product details and bundles | Partially completed | Single primary image, three-column amount buttons, numeric quantity dropdown, shared pricing/cart state, existing bundle rules, source details in a Product specifications disclosure. Real variant/bundle photos and live checkout remain blocked. |
| 13 | Related carousel | Completed | Side arrows, correct end states, touch/trackpad scrolling, keyboard controls, hidden scrollbar, adjacent preview, noninteractive edge fade removed during focus. |
| 14 | Footer | Partially completed | Animated/focused links, Contact Us link, disabled newsletter marketing omitted, verified production SSL link. Payment icons withheld because actual accepted methods cannot be established. |
| 15 | Resend contact | Partially completed | Real Resend adapter, bounded validation, exact origin, durable rate limits, payload-bound submission UUID, verified-sender gate, fixed configured recipient and Reply-To, honest accepted/failure states. Production recipient/limits, migration and controlled canary remain required. |
| 16 | Permanent rules | Completed | Same 12 rules added to AGENTS.md and CLAUDE.md; unrelated instructions preserved; obsolete warm-surface guidance updated. |
| 17 | Architecture | Completed | Reused catalog/pricing/cart/email/database infrastructure and focused shared components. No dependencies added. |
| 18 | Verification | Partially completed | Local functional/accessibility/responsive/motion checks completed. Live provider acceptance and native browser-UI zoom remain unverified. Equivalent 200% viewport reflow tested. |
| 19 | Report | Completed | Implemented/tested/deployed distinctions, evidence and unresolved dependencies recorded here. |

## Root causes and functional fixes

The featured homepage card spanned more columns than its neighbors. Split image/data
plates and restrictive typography constrained labels; an unlayered record-card rule
also overrode the intended zero outer padding. Cards now share equal geometry.

A native card amount dropdown replaces the sheet-first interaction and connects the
displayed price to the exact added variant. The product page replaces redundant amount,
tier and exact-quantity controls with one amount state and one quantity state. Bundles
call the existing shared price engine; only the largest eligible discount applies.

The mobile Change selection link now targets the actual purchase heading. Rewards'
oversized title and tight line height were corrected. Inactive program marketing and
empty documentation were removed, while server-side gates and source details remain.

Contact review corrected three edge cases: valid Unicode exceeding a byte cap; Resend
resolving ambiguous network errors instead of throwing; and permanent content-hash
deduplication suppressing an intentional later message. The streamed envelope now
allows 64 KiB, ambiguous responses retain their pending reservation, and each new
submission has a UUID separately bound to its normalized payload hash. Unchanged
retries reuse the UUID; changed content or an accepted submission starts a new attempt.

## External dependencies and evidence

### Photography and catalog identity

The repository's docs/reference/storefront-individual-imagery.md identifies all 56
front images as AI-generated. No approved real photographs were located. Source
files remain intact; the public AI disclosure was removed at the owner's request. The explicitly empty photography registry in
src/catalog/product-photography.ts accepts owner-verified asset/provenance entries;
a matching variant photograph will take precedence when supplied.

The requested Tesamorelin appears as **Tesmorelin** in the owner-published catalog,
using /catalog/items/tesmorelin. Its existing identity and display name are preserved.
No different compound was substituted. Correcting the source spelling requires owner
confirmation.

There are exactly **56 distinct published products**, not over 56. The 103 variants
are not counted as separate products, and catalog publication is not purchase availability.

### Purchasing and payment icons

Read-only Vercel Production variable metadata on 2026-09-06 did not list
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_ACCOUNT_ID, STRIPE_SHIPPING_RATE_ID or
STRIPE_TAX_CODE. Accepted merchant methods therefore cannot be established; no
speculative payment icons are displayed.

The synthetic-only checkout page gate was already repaired on main before this branch.
Remaining live prerequisites include approved versioned research-use agreement,
eligible account/destination, real sale records and provider mappings, inventory,
tax/shipping/fulfillment and payment capabilities. Enabling a button cannot supply
these dependencies. The runbook docs/runbooks/storefront-readiness.md gives the
activation process; its earlier database counts were not reverified as production.

Production https://propeptiq.com returned HTTP 200 with certificate verification and
HSTS max-age=63072000. The SSL SECURED footer treatment explicitly links that verified
origin. It is not a certification seal or broader security guarantee.

### Contact

Production metadata lists RESEND_API_KEY, RESEND_FROM, AUTH_EMAIL_DELIVERY_VERIFIED,
RATE_LIMIT_SECRET, EMAIL_MODE and DATABASE_MODE. Presence alone does not prove current
values or provider validity. It does not list CONTACT_SUPPORT_EMAIL,
CONTACT_RATE_LIMIT_MAX or CONTACT_RATE_LIMIT_WINDOW_SECONDS.

Migration src/db/migrations/0032_contact-email-deliveries.sql has not been applied to
production. Supply the actual support recipient and approved limits, verify the sender
and delivery attestation, apply the additive migration through the release process,
then run a controlled authorized canary following docs/runbooks/contact.md.

Tests use explicitly synthetic test doubles. No actual accepted provider send or
inbox delivery is claimed.

### Guarantee

No approved money-back, purity, delivery or other guarantee policy was found in the
inspected controlled-content sources. Approved wording is required before displaying
a guarantee or its explanatory interaction.

## Main files

- src/app/globals.css: shared theme, heading scales, card geometry and motion.
- src/components/site: public-home, trending-products, brand-illustration,
  promotion-bar, site-footer and rewards-science-scene.
- src/components/commerce: catalog-listing-card, variant-dropdown, variant-selector,
  product-purchase-panel, bundle-options, catalog-item-detail and related-products-carousel.
- src/catalog/bundle-options.ts and product-photography.ts: pure presentation and
  verified image resolution.
- src/contact, src/components/contact, contact page/API, database repository,
  schema and migration 0032.
- Controlled homepage/product copy, public rewards page, regression tests,
  AGENTS.md, CLAUDE.md, .env.example and contact runbook.

## Verification results

- npm test: **3,649 passed**, zero failures.
- npm run build: **passed**, including TypeScript and authentication-proxy verification.
- npm run verify:production-artifacts: **passed**, 1,267 files scanned, zero forbidden matches.
- npm run db:check: **passed**.
- npm run verify:workspace-boundary: **passed**.
- npm run lint and npm run typecheck: **passed**.
- npm run test:integration: stalled before producing test results using both default
  and visible reporters; task-owned runs stopped for diagnosis. A full run with the thread pool also stalled before results; root cause is unconfirmed. Focused integration runs with --pool=threads --maxWorkers=1 passed: 25 existing commerce schema tests and 3 new contact journal tests, each applying the full migration chain to disposable PGlite. The full suite remains unverified.
- npm run test:e2e -- tests/e2e/storefront-redesign.spec.ts: **12 passed**.
  Final follow-up: 2/2 motion/contact checks passed, including finite animation completion; 1/1 repeated 1440px geometry/accessibility check passed while capturing final viewport images.
- Final read-only code review: all three actionable contact findings fixed and
  re-reviewed; no remaining actionable finding in the scoped re-review.
- No formatter script exists; lint and git diff whitespace checks are used.

Each of the six viewport checks visits home, Retatrutide, rewards and contact, runs
full-page Axe and checks horizontal containment and heading treatment. Other tests
exercise exact cart IDs/totals, radio keyboard input, quantity and bundle state,
carousel ends/keyboard scrolling, finite/reduced motion, local contact 503 and touch.

Viewports: **375×812, 768×1024, 1280×800, 1366×768, 1440×900, 1920×1080**.
A 640×400 layout viewport covers the reflow equivalent of 1280×800 at 200%.
This is not verification of the Codex browser's native zoom UI.

Motion was checked through separate samples of the logo transform and promotion
background position, followed by reduced-motion checks; still images alone were not
used as proof of animation.

## Screenshot evidence

Local evidence is retained in .codex-evidence/redesign and excluded from Git.
Before images are from production; after images are local test renders, not a release.
Any synthetic program values in test screenshots come from the existing isolated
test driver and are not production claims.

- Before home, product and rewards: before-home-viewport.png,
  before-product-viewport.png and before-rewards-viewport.png.
- After all four pages at each size: after-home-WIDTH.png,
  after-product-WIDTH.png, after-rewards-WIDTH.png and after-contact-WIDTH.png.
- No prior contact implementation existed to compare.
- Full-resolution browser-suite artifacts also remain in test-results.

Reference patterns: [Aminoclub](https://www.aminoclub.com/us) and its
[GLP-3 product page](https://www.aminoclub.com/us/products/glp-3). No reference branding,
product images, promotion economics or guarantee policy was copied.

A separate local production-server launch was rejected by automatic approval review with only “blocked by policy” as its reason. No override was attempted; the successful isolated development-server browser tests supply the functional screenshots. The production build and artifact scan passed independently.

[Open before-and-after screenshot comparisons](storefront-redesign-evidence.md).
## Owner follow-up: remove AI disclosure

Removed the customer-facing AI caption from product cards, product views and the
cart, and replaced AI wording in image alternative text with neutral descriptions.
Images and internal provenance records are preserved. Updated the existing tests
and removed the now-unused caption layout rules.

Validation: 85 focused unit tests passed across six files; type checking and scoped
lint passed. Mobile (375px) and desktop (1440px) browser geometry/accessibility
checks passed across home, product, rewards and contact. Narrow source review found
no introduced defect. This follow-up has not been deployed.
