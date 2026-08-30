# PROPEPTIQ LABS

PROPEPTIQ LABS is a U.S.-only, research-use commerce application. The active product contract is the lightweight specification in `docs/product-requirements.md`; the sole active implementation plan is `docs/superpowers/plans/2026-08-24-propeptiq-lightweight-commerce.md`.

## V1 experience

- Anonymous visitors may browse the active catalog, see server-backed prices and promotions, and build a local cart.
- Checkout requires a Managed Neon Auth verified email, age 21+ confirmation, a structured research purpose, and the current versioned research-use attestation.
- Completing those steps creates an `active` individual buyer without routine staff approval or uploaded identity or organization material.
- An optional organization-name profile field is descriptive only; V1 has no organization tenancy or membership authorization.
- Checkout remains server-authoritative for account, attestation, product, destination, inventory, payment-provider enablement, price, discount, tax, and shipping facts.
- One MFA-authenticated administrator may manage and publish catalog, destination, promotion, refund, and fulfillment records.

## Non-negotiable boundaries

- Human or veterinary outcomes, dosing, administration, reconstitution, treatment positioning, and surrounding human-use evidence are prohibited. The canonical policy route is `/research-use-policy`; a future `/research-use` route may only redirect there.
- Production products, prices, lots, suppliers, and COAs come only from a real import manifest. Competitor or invented data is limited to clearly labeled test fixtures.
- Destination resolution is exact product/state override, then active product-policy-group/state rule, then `unavailable`. Territories are unavailable.
- Server code recalculates prices and discounts. Hosted card collection, signed webhook verification, idempotency, payment-event journaling, and read-only success pages remain required.
- Truthful discounts, bundles, subscription offers, loyalty, and cross-sells are permitted from active server records. Scarcity and countdowns require real inventory or a real promotion end time.

## Confirmed source boundaries

- The [FDA warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025) records that research-only statements did not overcome surrounding website evidence of intended human use in that enforcement matter.
- The [FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance) says advertising must be truthful and not misleading and that objective claims, express or implied, need adequate substantiation before dissemination; the overall impression matters.
- The [Stripe restricted-business FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs) says research peptides require preventive measures that keep them inaccessible to purchasers seeking nonresearch use, and Stripe's account-activation review determines support.

These sources do not decide whether any PROPEPTIQ SKU or destination is lawful or whether Stripe will accept this business.

## External launch inputs

Production commerce fails closed until owners supply and verify qualified legal review, a real catalog manifest, a counsel-approved state allowlist, tax configuration, shipping-service configuration, an operating fulfillment process, and payment-provider acceptance. These are external inputs, not application approval workflows or fabricated database records.

Production account creation also remains closed until every Managed Neon Auth
gate is evidenced: independent stable cookie-signing and application rate-limit
secrets; production-capable custom SMTP with a verified sender; provider-required
email verification; reviewed Preview and Production trusted origins with
localhost disabled for Production; provider configuration that revokes every
pre-existing session after a password reset; and a branch-isolated Preview
lifecycle test covering signup, email verification, sign-in, protected-route
return, sign-out, single-use password recovery, and rejection of sessions issued
before the reset. An external Auth resource may exist while the application
adapter remains disabled; resource availability, adapter activation, internal
user projection, and buyer activation are separate facts.

## Local verification

```powershell
npm run verify:workspace-boundary
npm test
npm run lint
git diff --check
```

These commands prove their stated local scopes only; they do not prove legal approval, provider acceptance, production readiness, or live integrations.

## Binding documentation

- Product requirements: `docs/product-requirements.md`
- Traceability: `docs/requirements-traceability.md`
- Catalog and destination policy: `docs/compliance/`
- Architecture and ADRs: `docs/architecture/`, `docs/adr/`
- Security, testing, deployment, and operations: `docs/security/`, `docs/testing.md`, `docs/deployment/`, `docs/runbooks/`
- Visual system and responsive behavior: `design-system/MASTER.md`, `docs/design/responsive-public-ui.md`
