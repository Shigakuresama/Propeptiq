# Security, Threat Model, and Secrets

**Status:** Proposed controls; production verification evidence is a launch gate.

## 1. Protected assets

- Researcher/organization identity and application evidence.
- Staff capabilities and strong-authentication state.
- Approved catalog, jurisdiction, and launch-control decisions.
- Product/lot/COA integrity and object hashes.
- Server prices, orders, payment journal, refunds, and reconciliation.
- Inventory ledger and fulfillment releases.
- Provider credentials, webhook secrets, database credentials, storage/email tokens.
- Append-only audit history.

Card numbers/CVC are intentionally outside the application boundary through hosted Checkout.

## 2. Trust boundaries

- Browser/client input is untrusted.
- Clerk authentication is trusted only after server SDK verification; business authorization still comes from Neon.
- Provider webhooks are untrusted until exact signature verification on the raw body.
- Uploaded files are untrusted bytes until type/size/malware/content review and approval.
- Reference sites and scientific/marketing content are untrusted source material.
- Logs/telemetry are operational aids, not immutable business evidence.

## 3. Priority threats and controls

| Threat | Failure scenario | Preventive/detective controls |
|---|---|---|
| Nonresearch purchaser misrepresentation | Consumer gains access using a disclaimer checkbox | Verified accounts/orgs, evidence review, attestations, holds, behavioral flags, suspension, immutable decisions |
| Human-use intent leakage | Copy or support content implies treatment/use | Prohibited-copy policy, two-person publication, content tests, incident escalation |
| Price/quantity tampering | Browser edits total or stale price | Server reload/calculation, immutable snapshots, integer amounts, transaction locks |
| Jurisdiction fail-open | Missing rule silently permits checkout | Exact-match rule, absent/expired/error = Unknown, denial tests |
| Cross-tenant IDOR | Member reads another organization’s applications/orders/COAs | Principal-bound DAL, mandatory org scope, opaque IDs plus policy, negative tests |
| Admin takeover | Attacker approves buyers/catalog/refunds | Required MFA, step-up, least privilege, separation of duties, alerts, rapid revoke runbook |
| Webhook forgery/replay | Fake or duplicate payment releases fulfillment | Raw-body signature verification, unique event inbox, payload hash, idempotent journal/transition |
| Success-page spoofing | Crafted redirect marks order paid | Read-only status page; payment writes only from verified provider evidence |
| Race/oversell | Concurrent checkouts allocate one lot twice | Transactional reservation, row lock/ledger constraint, reservation expiry |
| COA substitution | Wrong/changed document shown for a lot | Private storage, SHA-256, immutable object/version, lot FK, approval record |
| Malicious upload | Evidence document carries executable content | Allowlisted types/size, malware scanning plan, private storage, forced safe disposition |
| Secret leakage | Keys reach browser/log/repo | server-only modules, env validation, `.gitignore`, redaction, secret scanning, rotation |
| SQL injection | Untrusted filters alter query | Drizzle/parameterized queries, allowlisted sort/filter fields |
| CSRF/replay | Cross-site or repeated sensitive mutation | same-origin/Clerk protections, idempotency, origin checks where applicable, step-up |
| Email abuse/data leak | Applicant info sent to wrong recipient | typed templates, minimal payload, outbox, recipient ownership checks, no raw evidence attachments |
| Supply-chain compromise | Malicious dependency/build | lockfile, reviews, vulnerability/license checks, minimal packages, protected deployments |
| Premature fulfillment | Paid order ships while held | one-time release FK to verified payment and current clearance; fulfillment role cannot override |

## 4. Secrets

- Store local secrets only in ignored `.env.local`.
- Use separately scoped Vercel environment variables for Preview and Production.
- Never expose keys without the `NEXT_PUBLIC_` requirement; no server secret may use that prefix.
- Use restricted provider keys where supported.
- Rotate webhook/database/storage/email secrets after suspected exposure or staff/vendor changes.
- Do not print environment values during diagnostics.
- Document names and owners, never secret values.
- Production database migration credentials are separate from the runtime application role.

Expected secret/config names are documented in `.env.example` with empty values and safe modes.

## 5. Data minimization and privacy

- Do not collect health history or human-use information; reject/escalate attempts to submit it.
- Collect the minimum professional identity and research-purpose evidence required by approved policy.
- Store evidence bytes privately; application rows store metadata/hash.
- Redact email, full address, provider payload, free-text application content, and document names from general logs.
- Use opaque correlation IDs in logs.
- Retention/deletion schedule requires legal/privacy approval; design supports retention classes and holds.

## 6. Rate limits

Vercel Firewall protects coarse abuse at the edge. Application policies additionally limit sign-in/application submission, evidence upload, eligibility evaluation, checkout creation, webhook invalid-signature attempts, refund requests, and administrative decisions. Limits are keyed by the narrowest safe combination of IP, actor, organization, and resource; privileged users are not exempt from mutation limits.

Rate-limit failure is explicit and logged. It never falls back to allowing a protected action.

## 7. Audit integrity

Security/business audit events include actor/service identity, organization, action, resource, decision, timestamp, correlation ID, and redacted metadata. Database triggers prevent update/delete through the application role. High-risk events alert on staff grants, approval/suspension, catalog/jurisdiction publication, launch-gate changes, invalid webhooks, payment mismatch, refund, and fulfillment-release anomalies.

## 8. Security verification

- Static type/lint/secret/dependency checks.
- Unit and property tests for deny-by-default policy.
- Integration tests for database constraints and concurrent idempotency.
- Browser tests for auth/tenant boundaries and accessibility.
- Webhook contract tests with provider-generated test signatures.
- Restore drill and least-privilege privilege audit.
- Pre-launch threat-model review and adversarial review of implementation.

## 9. Residual risks

Software cannot determine SKU legality, verify applicant truth without operating procedures/evidence, guarantee provider approval, or replace supplier/warehouse controls. These remain documented business/legal launch gates.
