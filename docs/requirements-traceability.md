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

## Evidence boundaries

- Local unit, lint, or browser checks prove only the implementation scope exercised.
- Qualified counsel decides the real SKU/destination allowlist.
- Catalog owners supply the real manifest; operations supplies tax, shipping, and fulfillment configuration.
- The payment provider decides whether the real business is accepted.
- None of those external decisions may be inferred from code or represented as complete without owner evidence.
