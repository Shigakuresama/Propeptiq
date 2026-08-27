# Catalog and Claims Policy

**Status:** Binding V1 policy.

## Production data

The production catalog starts empty. A real import manifest is the only source for products, versioned prices, packages/forms, suppliers, lots, inventory, and COAs. Competitor, reference-site, or invented values may exist only as clearly labeled test fixtures and must be impossible to enable in production.

## Product activation

A product may become active only when server records contain:

1. a core product identity and research-use presentation;
2. an active versioned price;
3. a package/form;
4. a traceable lot with available inventory;
5. a product policy group; and
6. at least one resolved allowed state destination.

One administrator with an authorized staff capability and current MFA may activate or publish the record. Publication appends an audit event. No additional administrator action is part of V1 publication.

## Claims

- Prohibit human or veterinary outcomes, dosing, administration, reconstitution, treatment, structure/function, and surrounding human-use positioning across names, imagery, navigation, citations, merchandising, and support copy.
- A research-use disclaimer does not rescue a page whose overall presentation supplies human-use evidence. The [FDA warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025) is the confirmed enforcement example used for this boundary.
- Objective express or implied advertising claims must be truthful, not misleading, and adequately substantiated before publication, including the overall impression described by the [FTC guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance).
- Purity, sterility, testing, method, laboratory, accreditation, or similar analytical claims require corresponding active lot evidence. If the evidence is absent, omit the claim; ordinary product identity and truthful merchandising do not themselves require a COA.
- Neutral scientific citations may appear only when accurate, contextualized, and separated from product purchase actions so they do not become seller-authored outcome or usage claims.

## Merchandising

Truthful discounts, bundles, subscription offers, loyalty, and cross-sells are allowed when active server records define them. The server recalculates price and discount. Inventory scarcity requires real inventory; a countdown requires an actual promotion end time. Do not invent testimonials, popularity, urgency, laboratory marks, certifications, or shipping promises.

## Provider boundary

The [Stripe FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs) states that research peptides need preventive measures against nonresearch purchasers and that Stripe's activation review determines support. The application enforces the research-use account, attestation, product, and destination controls, but payment-provider acceptance remains an unresolved external launch input.

## Failure behavior

Missing manifest data, required activation fields, destination allowance, claim evidence, or provider enablement keeps the affected product or checkout unavailable. The application never creates substitute facts or a synthetic approval record.
