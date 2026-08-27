# Requirements Traceability

**Status:** Binding lightweight traceability map. Implementation evidence is added only after reproducible verification.

| ID | Binding requirement | Contract | Planned verification |
|---|---|---|---|
| ACC-01 | Clerk email verification + age 21+ + purpose + current attestation automatically yields an `active` individual buyer | `product-requirements.md`, authentication ADR | Domain and browser tests |
| ACC-02 | Optional organization name is profile text, never tenancy or membership scope | Authentication architecture, data model | Authorization negative tests |
| DST-01 | Exact product/state → active policy-group/state → unavailable; territories unavailable | Jurisdiction policy, domain policies | Resolution table tests |
| REV-01 | Review only for buyer `review` or destination `review`; immutable exact snapshot; changes invalidate | Domain policies, compliance-holds runbook | Snapshot mutation tests |
| CHK-01 | Six `CheckoutGate` values control commerce eligibility; tax/shipping are separate prerequisites | Product requirements, payments | Domain and checkout tests |
| CAT-01 | Activation requires core product, versioned price, package/form, lot/inventory, policy group, and an allowed destination | Catalog policy, data model | Publication policy tests |
| CAT-02 | Analytical claims require corresponding lot evidence; human/veterinary use positioning is prohibited | Catalog policy | Content-policy tests and adversarial review |
| COM-01 | Server-record discounts, bundles, subscription offers, loyalty, and cross-sells are allowed; totals remain server-calculated | Catalog policy, payments | Pricing/tamper tests |
| ADM-01 | One MFA-authenticated administrator may publish and audit catalog/destination/promotion changes | Authorization architecture | Capability and audit tests |
| PAY-01 | Hosted collection, signed raw-body webhooks, deduplication, event journal, and read-only success page | Payments architecture | Provider adapter/integration tests |
| FUL-01 | Release/shipment consumes once after payment, hold, inventory, buyer, product, and destination checks | Data model, runbooks | Concurrency and replay tests |
| UI-01 | Desktop-v3 visuals plus `responsive-v2` public catalog/prices/promotions/anonymous cart behavior | Design master, responsive handoff | Viewport, keyboard, zoom, reduced-motion tests |
| EXT-01 | Legal, manifest, destination, tax, shipping, fulfillment, and provider inputs fail closed when missing | Requirements, deployment | Configuration-denial tests plus owner sign-off |

## Task 6 implemented boundary evidence

The durable checkpoint is Task 6 in `docs/superpowers/plans/2026-08-24-propeptiq-lightweight-commerce.md`. The paths below are tracked evidence; local reports are supplementary and are not the sole proof.

| Requirement | Durable implementation and test evidence | Proven boundary |
|---|---|---|
| `CHK-01`, `COM-01` | `src/commerce/checkout-http.test.ts`, `src/commerce/checkout-contracts.test.ts`, `src/commerce/checkout-service.test.ts`, `src/domain/checkout.test.ts`, `src/domain/promotions.test.ts`, `tests/integration/checkout-repository.test.ts`, `src/components/commerce/checkout-form.test.tsx`, and `tests/e2e/task6-commerce.spec.ts` | Strict browser parsing and canonicalization; server reload of account, attestation, catalog/price/promotion, destination, inventory, tax, shipping, and provider facts; authoritative promotion/totals allocation; buyer-scoped replay/conflict; quote zero-write behavior; stale/tampered browser input rejection. |
| `PAY-01` | `src/commerce/stripe-payment-provider.test.ts`, `src/commerce/stripe-webhook-verifier.test.ts`, `src/commerce/provider-events.test.ts`, `src/commerce/provider-event-service.test.ts`, `tests/integration/provider-event-repository.test.ts`, `tests/integration/provider-event-processing.test.ts`, `src/commerce/checkout-success-read.test.ts`, and `src/app/checkout/success/[orderId]/page.test.tsx` | Provider request derivation; raw signed-event normalization; inbox claim/replay/hash-conflict/deferred and lease behavior; atomic journal effects; exact durable signed authority; owner-only query-only success that cannot mark an order paid. |
| `FUL-01` | `src/domain/fulfillment.test.ts`, `src/domain/orders.test.ts`, `src/commerce/refund-service.test.ts`, `src/commerce/fulfillment-facts.test.ts`, `src/commerce/fulfillment-service.test.ts`, `tests/integration/refund-fulfillment-repository.test.ts`, `tests/integration/fulfillment-repository.test.ts`, `tests/integration/provider-event-processing.test.ts`, `src/components/admin/commerce-command-panel.test.tsx`, and `tests/e2e/task6-commerce.spec.ts` | Refund/hold/late-payment decisions; one release/consume/handoff; delivery and exception commands; bounded repository retry and serialization behavior under PGlite's limits; distinct staff commands and readback. The guarded real-PostgreSQL collection in `tests/postgres/*.postgres.test.ts` is a separate conditional lane. |
| `UI-01` | `tests/e2e/task6-commerce.spec.ts`, `tests/e2e/task5-account-admin.spec.ts`, `src/components/commerce/checkout-form.test.tsx`, `src/components/admin/commerce-command-panel.test.tsx`, and `src/app/checkout/success/[orderId]/page.test.tsx` | Approved desktop-v3/responsive-v2 output at 375, 768, 1024, and 1440 pixels; keyboard navigation and focus restoration; reduced motion; Axe checks; 200% CSS zoom; Sheet behavior; and no horizontal overflow. |
| `EXT-01` | `src/config/commerce-capability.test.ts`, `src/commerce/server-runtime.test.ts`, `src/auth/local-commerce-driver.test.ts`, `src/commerce/local-harness-http.test.ts`, `src/app/__synthetic_local_checkout/local-harness-routes.test.tsx`, `scripts/verify-production-artifacts.test.mjs`, `scripts/verify-production-artifacts.mjs`, `next.config.ts`, and `vitest.config.ts` | Exact capability/environment denial; disabled runtime with no mutation/external call; conspicuous local-fixture alias; inert production route implementation; source-scanner regression plus scans of actual emitted Turbopack and Webpack deployable outputs. |

## Evidence boundaries

- Unit tests prove local controller, adapter, projection, and domain behavior only.
- PGlite integration tests prove deterministic SQL, constraints, bootstrap, and the exercised repository behavior; they do not prove PostgreSQL advisory locks, transaction isolation, deadlock handling, or real concurrency.
- The browser lifecycle uses a conspicuous serial synthetic-local driver. It does not prove Stripe, carrier, warehouse, tax-law, hosted-database, or production behavior.
- The three-file/twenty-test real-PostgreSQL collection runs only with a narrowly isolated `TEST_DATABASE_URL` and exact `TEST_DATABASE_CONFIRMATION=isolated-test-database`. Without both guards it is **NOT RUN**, no connection is made, and no real-locking claim is permitted.
- Closed production-identity Turbopack and Webpack builds plus scans of their actual deployable outputs prove that forbidden local fixtures/routes/sentinels are absent from those artifacts; they do not establish external acceptance.
- Qualified counsel decides the real SKU/destination allowlist.
- Catalog owners supply the real manifest; operations supplies tax, shipping, and fulfillment configuration.
- The payment provider decides whether the real business is accepted.
- None of those external decisions may be inferred from code or represented as complete without owner evidence.
