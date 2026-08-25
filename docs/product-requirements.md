# Product Requirements and Acceptance Criteria

**Status:** Binding specification for implementation.

## 1. Objective

Build PROPEPTIQ LABS as a production-capable U.S.-first full-stack application for the sale of approved research materials strictly to verified researchers or organizations for legitimate laboratory use. The platform must prevent sale, payment, and fulfillment when product, buyer, destination, payment-provider, tax, shipping, inventory, or compliance evidence is absent or adverse.

## 2. Confirmed requirements

- Next.js App Router, strict TypeScript, Tailwind, and shadcn/ui.
- Clerk-managed authentication, with MFA protecting administrative access.
- Centralized server-side authorization and data access.
- Neon PostgreSQL, Drizzle ORM, and versioned migrations.
- Hosted payment collection behind a provider abstraction; Stripe Checkout is the baseline only after explicit business/catalog approval.
- Object storage for product media and lot-level COAs.
- Transactional email, Vercel environments, monitoring, backups, rate limiting, audit logging, and automated tests.
- No guest checkout.
- Verified researcher/organization accounts and intended-use attestations at approval and checkout.
- Account/product eligibility, manual review, compliance holds, rejection/suspension, immutable decision history, lot inventory, and COA linkage.
- Fulfillment requires both a verified payment event and compliance clearance.
- U.S. states and Washington, D.C. are evaluated per SKU and destination. Territories remain manual review until separately approved.
- Jurisdiction values are exactly `Allowed`, `Manual Review`, `Blocked`, and `Unknown`. Missing policy is `Unknown`.
- Product legality, payment-provider eligibility, tax, buyer verification, and shipping eligibility are independent gates.
- No invented products, prices, purity claims, labs, certifications, COAs, stock, testimonials, or approvals.

## 3. Users and capabilities

### Public visitor

May read the research-use policy, system controls, and only approved public catalog records. Cannot create a cart or checkout anonymously.

### Applicant

An authenticated person who may create an individual or organization application, attest legitimate intended use, supply required business/research evidence, and view the status/history of their own application.

### Approved researcher/member

May access products for which the account, organization, product, and destination are eligible; submit a checkout attestation; and view their organization’s orders and lot/COA records. Approval does not guarantee any SKU is eligible.

### Organization administrator

May manage organization membership and organization evidence, but cannot grant compliance approval or alter immutable decision history.

### Compliance reviewer

May place/release holds, approve/reject/suspend applications, and decide manual-review eligibility. Decisions require a reason, evidence reference, MFA-protected step-up, and append-only history.

### Catalog manager

May draft product and lot records. Publishing requires independent approval and complete evidence fields.

### Finance operator

May reconcile payments and request refunds. A refund requires reason, idempotency, journal entry, and provider confirmation.

### Fulfillment operator

May act only on orders bearing a current fulfillment release. Cannot override compliance or payment state.

### Platform administrator

May manage staff access and launch controls. Cannot edit append-only history and must use MFA/step-up verification.

## 4. Core workflows

### 4.1 Researcher approval

1. User authenticates and selects individual or organization application.
2. Server creates a draft owned by the authenticated principal.
3. Applicant supplies minimum identity, organization, research-purpose, and evidence metadata; sensitive documents use private storage.
4. Submission records the exact attestation text/version and timestamp.
5. Reviewer approves, rejects, or requests review; every transition appends a decision record.
6. Suspension or expiration immediately blocks new checkout attempts without deleting prior decisions.

### 4.2 Catalog publication

1. Catalog manager creates a draft product without saleable defaults.
2. Verified identity/CAS/formulation/storage fields and approved category assignments are added.
3. At least one active lot includes inventory and an approved, private or authorized COA link.
4. Required product-by-jurisdiction rules exist; absent rules remain `Unknown`.
5. Independent approval records the evidence bundle and activates the product.

### 4.3 Eligibility and checkout

1. Authenticated approved buyer selects destination and quantities.
2. Server reloads active product/lot/prices and ignores browser totals.
3. Server evaluates separate gates: buyer, catalog, jurisdiction, payment provider, tax, shipping, inventory, and compliance.
4. Any `Blocked` result blocks checkout. Any `Unknown` or `Manual Review` result creates/updates a compliance hold and blocks hosted checkout.
5. A passing evaluation is snapshotted, then the buyer accepts the current intended-use attestation.
6. Server creates an order and hosted Checkout Session using an idempotency key and server price snapshot.
7. Redirect page displays current order status only; it never marks payment.

### 4.4 Payment and fulfillment

1. Webhook endpoint reads the raw body and verifies the provider signature.
2. Unique provider event ID is stored before processing; duplicates return success without repeating side effects.
3. Append-only payment journal records the event and correlated order.
4. Server verifies payment status and amount/currency against the order snapshot.
5. Eligibility is re-evaluated after payment. A changed/unknown gate yields `Paid on hold`, not fulfillment.
6. Only verified paid status plus current compliance clearance creates a fulfillment release.
7. Fulfillment consumes that release once and records lot allocation/shipment evidence.

## 5. Content policy

Product pages may show only defensible research data backed by approved records: identity, CAS number where verified, formulation, purity only from actual batch evidence, analytical method, storage, lot/batch, and COA. The public experience must not include human-use testimonials/reviews or dosage, reconstitution, injection, treatment, weight-loss, bodybuilding, anti-aging, therapeutic, structure/function, or human/veterinary outcome claims.

Scientific literature may be stored as a citation record, but publication requires a compliance review that confirms the presentation does not create human-use intended-use evidence. A disclaimer cannot cure prohibited surrounding claims.

## 6. Non-functional requirements

- Deny by default for authorization, jurisdiction, catalog activation, provider activation, and fulfillment.
- Server-only secrets and provider clients.
- Idempotent mutations and webhook processing.
- Cross-tenant isolation on every organization-scoped query.
- Append-only decision, payment, inventory, fulfillment-release, and security-audit history.
- Structured logs without secrets, full document contents, payment data, or unnecessary applicant PII.
- Accessible keyboard, focus, validation, error, loading, and reduced-motion behavior.
- Restore procedures with documented RPO/RTO and periodic evidence.
- No build-time dependency on production credentials or production data.

## 7. Unresolved business decisions

- Final entity and formation state.
- Warehouse/fulfillment state and operating process.
- SKU catalog, suppliers, labels, test specifications, and actual lots.
- Licenses/registrations and approved destination matrix.
- Tax registrations/nexus and calculation approach.
- Carrier/service restrictions and return/refund policy.
- Production domains, email sender, privacy/retention schedule, and support escalation owners.
- Payment-provider account approval and any provider-specific controls.

Each unresolved decision must have an accountable owner, evidence reference, approval timestamp, and review/expiry date before its corresponding launch gate can pass.

## 8. Acceptance criteria

- An anonymous user cannot create a checkout session.
- An authenticated but unapproved user cannot create a checkout session.
- Missing product/destination policy evaluates to `Unknown` and cannot create a checkout session.
- A manual-review destination creates a hold and cannot create a checkout session until a reviewer decision exists.
- Browser-supplied prices/totals cannot change an order total.
- Replayed webhook events do not duplicate payment journal entries, inventory allocation, email, or fulfillment release.
- A success-page request cannot move an order to paid or fulfillable.
- A verified payment whose compliance clearance is missing/expired remains on hold.
- Fulfillment cannot occur without a one-time current release that references payment and clearance evidence.
- Product purity/COA fields cannot publish without an actual approved lot record.
- Audit/decision/payment journal rows cannot be updated or deleted through the application role.
- Admin decisions and refunds require authorized capability and recent strong authentication.
- Automated unit, integration, contract, accessibility, and browser tests cover all denial paths above.
