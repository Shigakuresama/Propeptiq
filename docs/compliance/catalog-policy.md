# Catalog and Compliance Policy

**Status:** Binding product behavior. No saleable catalog is currently approved.

## 1. Purpose boundary

PROPEPTIQ LABS serves only legitimate laboratory and research use. Products are not for human consumption, human use, veterinary use, food use, diagnosis, treatment, cure, mitigation, prevention, or alteration of human/animal structure or function.

This boundary is enforced through account approval, catalog approval, content review, eligibility evaluation, checkout attestation, compliance holds, and fulfillment release. Footer text or a checkbox alone is insufficient.

## 2. Catalog manifest

Every proposed SKU enters through a versioned catalog manifest containing:

- internal product ID and proposed public name,
- supplier/manufacturer evidence reference,
- verified identity and source for CAS number if shown,
- formulation and package/label evidence,
- storage instructions supported by supplier/stability evidence,
- approved research-only description,
- prohibited-content review,
- price-book record and currency,
- payment-provider eligibility evidence,
- product-by-jurisdiction policy version,
- tax/shipping classifications,
- actual lot and inventory record,
- COA/test records and object hashes,
- approver, approval timestamp, effective date, and review/expiry date.

An absent field is not filled with a generic claim. Fields that are optional for publication are omitted; required evidence gaps block publication.

## 3. Lot and COA policy

- Purity and analytical results are lot-level facts, never universal product promises.
- A visible purity value must reference the exact approved lot result, analytical method, source document, and document hash.
- COAs use private object storage by default and are served through an authorization route. Public release, if later chosen, is an explicit per-document approval.
- Replacing a COA creates a new object/version; it never mutates the evidence attached to an historical order.
- Lot release, quarantine, recall, exhaustion, and expiration are explicit states.
- Inventory is ledger-based and tied to a released lot.
- Laboratory names, accreditation, methods, and certifications are displayed only when the actual source document and verification support them.

## 4. Content rules

### Allowed when verified

- Chemical/peptide identity.
- CAS number with authoritative source.
- Formulation and quantity as labeled.
- Lot/batch identifier.
- Analytical method and actual result from the linked lot record.
- Storage conditions supported by evidence.
- Approved COA and test-document access.
- Neutral research-use restriction and purchasing eligibility language.

### Prohibited

- Dosage, cycling, reconstitution, injection, administration, or route-of-use guidance.
- Human or veterinary treatment, disease, weight-loss, bodybuilding, anti-aging, sexual, cognitive, recovery, longevity, or other outcome claims.
- Structure/function claims for humans or animals.
- Human/veterinary testimonials, reviews, before/after material, influencers, or community content implying use.
- “Pharmaceutical grade,” “medical grade,” “safe,” “guaranteed,” certification, accreditation, purity, sterility, or quality claims without exact evidence.
- Scarcity, countdowns, urgency, promotional bundles, subscriptions, cross-sells, or recommendations until separately approved—and never where they encourage nonresearch use.
- Scientific literature summaries that convert the product presentation into human-use intent.

The FDA warning letters in `docs/sources.md` demonstrate why research-use labels do not cure surrounding human-directed claims.

## 5. Publication workflow and separation of duties

1. Catalog manager creates a draft manifest.
2. Evidence validator confirms required fields and hashes.
3. Compliance reviewer reviews copy, intended-use risk, provider eligibility, and jurisdiction coverage.
4. A publisher distinct from the drafter approves a version.
5. Publication activates exactly that immutable version for its effective interval.
6. Material evidence changes create a new version and can automatically hold affected checkout/order flows.

No application seed inserts products/categories/prices. Test fixtures are labeled test-only and cannot run in production migrations.

## 6. Buyer controls

- Only approved, unexpired, unsuspended researcher/organization accounts can evaluate checkout.
- Approval records exact intended-use attestation and evidence.
- Checkout requires a fresh attestation tied to the order and wording version.
- Suspicious purpose language, consumer-style behavior, invalid organization evidence, policy mismatch, or manual-review jurisdiction creates a hold.
- Rejection/suspension has an appeal/re-review path without erasing history.
- Staff cannot advise on human/veterinary use; such requests are declined and logged/escalated under the incident policy.

## 7. Launch status

The current catalog status is **closed**. No SKU, price, lot, COA, supplier, lab, inventory, category, or destination permission in competitor/reference material is approved for PROPEPTIQ.
