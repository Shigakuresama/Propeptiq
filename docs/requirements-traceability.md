# Binding Requirements Traceability

**Status:** Current planning ledger. This document distinguishes confirmed requirements, proposed implementation controls, unresolved business facts, and production launch gates.

## 1. Requirement-to-document map

| Requirement | Status | Authoritative documentation | Implementation evidence required later |
|---|---|---|---|
| Production full-stack Next.js App Router application | **Confirmed** | `README.md`, `docs/product-requirements.md`, ADR 0001, `docs/architecture/system-architecture.md` | Clean build, server/runtime tests, Vercel Preview smoke test |
| Strict TypeScript, Tailwind, shadcn/ui | **Confirmed** | ADR 0001, implementation plan | Typecheck, lint, component and accessibility tests |
| Clerk authentication, organizations, administrator MFA, centralized server authorization/DAL | **Proposed baseline**; production settings are a **launch gate** | ADR 0002, `docs/architecture/authentication-authorization.md` | Production-instance settings review, MFA/reverification tests, cross-tenant negative tests |
| Neon PostgreSQL, Drizzle, reviewed versioned migrations | **Proposed baseline** | ADR 0003, `docs/architecture/data-model.md`, deployment guide | Isolated integration database, migration review, least-privilege grants, restore evidence |
| Object storage for product media and lot-level COAs | **Proposed baseline:** private Vercel Blob; production store is a **launch gate** | ADR 0003, threat model | Private-store configuration, upload validation, hashes, access tests, retention approval |
| Transactional email, observability, rate limiting, backups, audit logging | **Proposed controls**; production accounts/rules are **launch gates** | ADR 0005, threat model, deployment guide | Outbox tests, redaction tests, published rate rules, alert test, backup and restore drill |
| Hosted payments behind a provider abstraction | **Proposed baseline:** Stripe Checkout; live activation is a **launch gate** | ADR 0004, `docs/architecture/payments.md` | Provider approval for the actual entity/catalog, signed webhook replay tests, reconciliation evidence |
| Research/laboratory use only; no human or veterinary use | **Confirmed** | `docs/product-requirements.md`, `docs/compliance/catalog-policy.md`, design system | Copy-policy tests across pages, metadata, structured data, email, and catalog publication |
| No prohibited health, dosage, administration, treatment, body-outcome, or testimonial content | **Confirmed** | Catalog policy, product requirements | Publication allowlist plus human review; rendered-content regression scan |
| No invented catalog facts | **Confirmed** | README, catalog policy, reference-site audit | Empty production catalog until an approved manifest and actual lot evidence exist |
| No guest checkout; verified researcher or organization account | **Confirmed** | Product requirements, authentication/authorization design | Anonymous and unapproved checkout denial tests |
| Intended-use attestations, approval/rejection/suspension, manual review, immutable decisions | **Confirmed** | Product requirements, data model, authorization design | State-machine, database append-only, step-up, and actor/evidence tests |
| Default-deny product-by-jurisdiction matrix | **Confirmed** | `docs/compliance/jurisdiction-matrix.md`, data model | All state/DC identity rows; no permissive rules; missing/expired/malformed rule tests |
| Separate legality, provider, tax, buyer, shipping, inventory, compliance, and launch gates | **Confirmed** | Jurisdiction matrix, domain policy contracts, system architecture | Exactly-one-result-per-gate tests and fail-closed evaluator behavior |
| Fulfillment only after verified payment webhook and current compliance clearance | **Confirmed** | Payments architecture, data model, runbooks | End-to-end release issue/revoke/consume tests; redirect-spoof denial test |
| Server-calculated prices; browser totals untrusted | **Confirmed** | Payments architecture, implementation plan | Tampered total, stale price, currency, quantity, and concurrency tests |
| Signed, deduplicated/idempotent payment events and append-only payment journal | **Confirmed** | Payments architecture, data model | Raw-body signature, same-ID/same-hash replay, hash-conflict, retry/lease, and journal tests |
| U.S. states plus D.C.; territories manual review | **Confirmed scope**; SKU decisions are **unresolved** | Jurisdiction matrix | Counsel-approved versioned rules for every active SKU/destination |
| Entity, warehouse, licenses, catalog, price book, lots, tax, and shipping matrix | **Unresolved** | README launch gates, product requirements, runbooks | Accountable owner, source evidence, approval, effective date, and review/expiry for each |
| Durable setup, architecture, ADR, data, auth, payment, security, compliance, jurisdiction, deployment, testing, and runbook documentation | **Confirmed and present** | README documentation map, `docs/reviews/pre-implementation-review.md` | Keep updated with implementation evidence and release-readiness report |

## 2. Design and tool traceability

| Requested capability | Planning status | Required completion evidence |
|---|---|---|
| `ui-typography` | Applied to the two-font Newsreader/Geist system, readable measures, hierarchy, punctuation, and copy guardrails | Responsive rendered typography and accessibility review |
| `ui-ux-pro-max` | Applied; the generic glassmorphism recommendation was rejected in favor of the evidence-led clinical archive direction | Approved responsive design and UI audit |
| `web-design-guidelines` | Scheduled as the final implementation review gate | Current guideline fetch and issue-by-issue remediation |
| `vercel-react-view-transitions` | Restricted to meaningful list/detail continuity with reduced-motion fallback | Progressive-enhancement and fallback tests; no decorative motion |
| `vercel:shadcn` | Selected for accessible locally owned UI primitives | Component installation review and keyboard/state tests |
| `vercel:satori` | Planned only for original brand-level Open Graph artwork | Metadata build test and claim/content review |
| Superdesign | Project and desktop draft version 3 created and audited; **awaiting user approval** | Approval recorded in `docs/design/superdesign-review.md` before UI implementation |
| Chrome / agent-browser | Used for direct reference-site and rendered-draft inspection | Later local and Vercel Preview QA at 375, 768, 1024, and 1440 pixels |
| Sites | Evaluated for the requested workflow; Vinext/Cloudflare production scaffolding conflicts with the later binding Next.js/Vercel requirement | Sites may support design/preview only; canonical production target remains Vercel per ADR 0001 |
| Data visualization | A separate chart/dashboard is not justified without real data; the Proof Rail is the minimal useful provenance visualization | Only implement visualizations that expose real lot/evidence relationships |

## 3. Current hold

The requirements and architecture documentation are present. Superdesign draft version 3 exists and has passed a truthfulness review, but it has not been approved by the user. No further implementation task may proceed until that approval is recorded. Existing uncommitted domain work remains paused and is explicitly **request changes** in `docs/reviews/pre-implementation-review.md`; passing isolated runtime tests does not override its failed type/lint gates or open any implementation task.

## 4. Production launch decision

**BLOCKED by design:** production commerce cannot activate while any business/catalog/provider/jurisdiction/tax/shipping/fulfillment/security/recovery gate is unresolved. This is an expected safe state, not an implementation failure.
