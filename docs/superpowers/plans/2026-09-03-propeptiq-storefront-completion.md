# PropeptIQ storefront completion plan

**Date:** 2026-09-03

**Authoritative branch:** `main` at `6520a822d75845265cb7d438a6146e333824ec17` when this plan was written
**Execution model:** subagent-driven, one implementation unit at a time, independent review before each merge

## Outcome

Finish the requested storefront expansion through small, reviewable releases while preserving the existing research-use boundary and server-side commerce authority. Customer-facing improvements that depend only on verified repository facts may ship now. Product facts, claims, relationships, legal text, newsletter collection, inventory, Stripe activation, and indexing remain closed until their named owner inputs are supplied and verified.

## Confirmed architecture

- Next.js 16.3.2 App Router and React 19 use Server Components for public data projection and narrowly scoped Client Components for cart, selectors, search, and forms.
- The code-backed storefront manifest covers 56 product families and 103 exact variants. Forty variants have reviewed positive competitor-equivalent display references; 63 have no exact same-product/same-amount match and remain pending.
- `variantId` is the cart-line identity. Repeated exact variants merge; different variants remain separate.
- Integer minor-unit pricing applies 0% at quantity 1, 8% at 2, 10% at 3 through 9, and 30% at 10 through 25. The single highest eligible automatic promotion or quantity discount wins.
- WINTER30 is a centralized, automatic, sitewide 30% campaign. Stripe promotion-code entry is disabled so it cannot stack.
- Public cart pricing is a nontransactional preview. Quote/session creation reloads authoritative variants, prices, inventory, mappings, promotion eligibility, shipping, and tax on the server, and emits inline Stripe `price_data` only after all gates pass.
- Catalog and bottom search share one deterministic local index/scorer. The bottom search uses the existing Radix Sheet focus trap.
- Why Choose, FAQ, approved product information, related products, newsletter, legal destinations, and calculator presentation already have rendering/integration boundaries. Their production registries or launch gates are empty by design.
- Resend is already installed for Better Auth transactional email. No newsletter subscriber adapter, approved privacy destination, or production newsletter attempt gate is configured.

## Reference rulings

- Reuse Amino Club only for high-level promotion, card, price, purchase-control, FAQ, newsletter, and related-card interaction direction.
- Do not copy its wording, images, trade dress, purity labels, stock, shipping claims, research claims, or product-use content.
- Do not extrapolate a competitor amount to a different PropeptIQ variant. The 63 unmatched variants remain `Pricing coming soon` until an exact owner-approved base price is supplied.
- Do not adopt the attachment proposals for 1/3/6 tiers, subscriptions, lookup-key/client Stripe authority, dosing, stacking, treatment language, or generic supplement claims.
- The supplied vial screenshots are composition references only. Any future product art must use original PropeptIQ assets and approved label facts.

## Phase 1 — visible promotion and purchase-state clarity

**Can execute now. No catalog, price, inventory, or provider mutation.**

1. Centralize customer-facing labels for `ready`, `cart_preview`, `checkout_unavailable`, `pricing_pending`, `unavailable`, and `local_preview` so cards, variant selectors, quick-add, price rows, and product purchase panels do not contradict one another. Keep addable preview-only variants distinct from non-addable checkout-unavailable variants.
2. Preserve production cart-preview testing for reviewed positive `preview_only` variants, but label it clearly as a cart preview rather than presenting `Checkout unavailable` next to an enabled ADD control.
3. Keep the new `cart_preview` state public-presentation-only; normalize it to the existing cart DTO `checkout_unavailable` state at the preview boundary so cart continuation and checkout authority remain closed.
4. Keep pending variants non-addable and keep real checkout closed.
5. Make the WINTER30 bar compact on narrow screens with a three-part layout (snowflake, campaign copy, copy control), a 44-pixel target, visible copied state, and one polite status announcement.
6. Add focused component tests and Playwright assertions at 375, 768, and 1440 CSS pixels. Confirm exact campaign copy, price/badge semantics, keyboard operation, no horizontal overflow, and unchanged cart identity. The repository's Playwright server runs in local mode, so production-only `Cart preview only` copy is proved by production-context component tests; browser assertions prove the local preview state actually rendered by that test server.

Expected files:

- `src/catalog/storefront-price-presentation.ts`
- `src/cart/preview.ts`
- `src/components/commerce/add-to-cart-button.tsx`
- `src/components/commerce/catalog-listing-card.tsx`
- `src/components/commerce/product-price.tsx`
- `src/components/commerce/product-purchase-panel.tsx`
- `src/components/commerce/variant-selector.tsx`
- `src/components/commerce/quick-add-variant-sheet.tsx`
- `src/components/site/promotion-bar.tsx`
- colocated tests, including `src/components/commerce/catalog-explorer.test.tsx` and `src/components/commerce/related-products-carousel.integration.test.tsx`
- `tests/e2e/public-storefront.spec.ts`
- `tests/e2e/growth-experience.spec.ts`

## Phase 2 — checkout boundary and documentation truth

**Can execute after Phase 1. Must not enable commerce.**

1. Remove the unused legacy public-catalog promotion fetch and ignored `promotions` prop from the checkout page/form.
2. Prove that browser checkout requests contain only exact variant IDs, quantities, destination, optional reward redemption, and the current server revision; prices, discounts, promotion claims, and Stripe identifiers remain rejected or absent.
3. Reconcile stale documentation about canonical routes, exact variant identity, automatic promotions, Better Auth Resend delivery, email capability, and the current 40-positive/63-pending manifest.
4. Document the two separate production activation gaps: an authoritative live cart/preview source and buyer-page readiness for the PostgreSQL/Stripe runtime.

Expected files:

- `src/app/checkout/page.tsx`
- `src/components/commerce/checkout-form.tsx`
- their focused tests
- `docs/product-requirements.md`
- `docs/architecture/payments.md`
- `docs/runbooks/production-cutover.md`
- `docs/runbooks/storefront-configuration.md`

## Phase 3 — approved homepage, information, legal, and related content

**Blocked on exact business approval; infrastructure already exists.**

1. Receive approved Why Choose and FAQ records with source references, approval note, and review date.
2. Approve their exact homepage anchors, then publish them through the existing controlled-content and public-information registries so bottom search indexes only approved copy.
3. Receive exact product `relatedProductIds`; do not infer research pairings from category or competitor merchandising.
4. Receive approved product descriptions, technical/research/storage records, and their exact `contentIds`.
5. Receive approved Privacy, Terms, Shipping/Returns, Refund, FDA, Contact/Support, and shipping-information copy and routes before enabling those footer destinations.
6. Keep the four owner-requested `/` social placeholders until real approved profile URLs are supplied.

No external CMS is justified. If browser-based publishing later becomes an operational requirement, extend the existing MFA/capability/audit admin after database migration reconciliation.

## Phase 4 — newsletter adapter and Resend provisioning

**Implementation can be prepared fail-closed; collection cannot be activated without privacy and retention approval.**

1. Implement the existing `NewsletterGateway` against the installed Resend SDK using the current official Contacts/Topics model, not the transactional send API as a fake mailing list.
2. Implement a durable, privacy-preserving attempt gate appropriate to the deployed runtime; do not rely on process memory in production.
3. Add strict environment configuration for a dedicated full-access newsletter key and the global Resend Contact Topic identifier. Do not use the deprecated Audience model. Server-only modules must import `server-only`; no key or provider response reaches the client.
4. Preserve `NEWSLETTER_NOT_CONFIGURED` and do not read/store/transmit an address unless gateway, attempt gate, approved privacy destination, and all required configuration are present.
5. Before creating a provider key, verify the signed-in Resend team, verified domain, intended key scope, and target Vercel project/environments. Obtain action-time confirmation, create the least-privileged key, install it directly without exposing it in logs/chat, and verify Preview before Production.
6. Activate only after the owner approves consent wording, privacy route, duplicate semantics, retention/deletion policy, abuse policy, and incident owner.

## Phase 5 — canonical evidence, availability, and checkout activation

**Blocked on business/provider/operations evidence.**

1. Resolve the physical sale-unit contradiction: the browse copy contains `x 10 vials` descriptions while current canonical public candidates represent one bottle per cart unit.
2. Reconcile exact active variants, base prices, lots/inventory, destination policies, Stripe Product/Price mappings, tax, shipping, fulfillment, refunds, and provider acceptance.
3. Rehearse pending migrations on an isolated clone, compare the migration ledger and schema, prove backup/rollback, and perform no production migration without a fresh read-back and explicit authorization.
4. Join canonical variant-linked quality records and implement an approved secure public document-delivery boundary before claiming downloadable COAs.
5. Add an explicit public availability reason before rendering an `Out of stock` badge.
6. Connect the buyer checkout page to the live runtime only after the authoritative live cart source and every capability gate pass. Keep webhook signature verification, idempotency, settlement, fulfillment, and refund controls unchanged.

## Phase 6 — analytics, SEO, final release, and post-deploy proof

1. Do not add a marketing analytics SDK until the provider, event taxonomy, consent classification, retention, and privacy copy are approved. Keep operational telemetry separate and redact customer/product-research context.
2. Inventory the existing signed referral cookie before introducing a consent manager.
3. Keep global `noindex, nofollow` until legal/content launch readiness and an explicit indexing decision.
4. Review each phase independently, commit only its owned files, open a PR, inspect the exact PR diff, fix findings with regression coverage, merge, and wait for the exact deployment.
5. For the final candidate run workspace boundary, artifact scanner, lint, generated types, typecheck, full unit, integration, E2E, both supported production builds/artifact scans, and migration reproducibility. Report exact pass/fail counts and do not convert missing external evidence into a pass.
6. Verify the deployed homepage, catalog, representative active and pending product pages, cart, search/focus, promotion copy, newsletter gate, footer, health route, mobile overflow, and console output at the exact deployed revision.

## Owner inputs still required

- Exact base prices for the 63 unmatched variants, or an explicit decision to keep them pending. Unit-price extrapolation is not acceptable.
- Exact one-bottle versus multi-vial sale-unit decisions.
- Active inventory/lots, Stripe mappings, destination rules, tax/shipping/fulfillment/refund operations, and provider approval.
- Exact related-product and homepage-highlight IDs.
- Approved Why/FAQ/product/research/storage/legal/privacy copy and routes.
- Newsletter privacy, consent, retention/deletion, abuse/attempt, duplicate, topic/list, and incident-owner decisions.
- Real social URLs when they should replace the owner-authorized `/` placeholders.
- Calculator limits, copy, placement, sources, legal review, and public-launch approval.
- Explicit SEO/indexing and production commerce activation decisions.

## Rollback

- Each phase is a separate PR and deployment. Revert the phase PR if its live read-back fails.
- Phase 1 changes presentation only and can be reverted without catalog or cart migration.
- Phase 2 removes only unused coupling; its rollback restores the previous props/fetch without data changes.
- Newsletter remains default-closed, so removing provider configuration disables collection without altering the public contract.
- Commerce activation requires the existing operational rollback and incident runbooks; never use a client-side flag or stale preview token as payment authority.
