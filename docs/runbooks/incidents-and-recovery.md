# Runbook: Incidents and Recovery

## Incident classes

- Suspected account/admin compromise.
- Secret/token exposure.
- Unauthorized data/object access.
- Catalog/COA/evidence integrity issue.
- Jurisdiction/content/compliance fail-open.
- Payment/webhook/refund/reconciliation anomaly.
- Fulfillment without valid release.
- Database corruption/outage or storage loss.
- Provider outage or compromised dependency/deployment.

## Immediate containment

1. Assign incident ID, severity, incident commander role, and secure communication channel from production operator configuration.
2. Preserve evidence and timestamps; do not paste secrets, raw documents, or broad PII into chat/tickets.
3. Close the narrowest relevant launch gates. For uncertain payment/compliance/fulfillment impact, disable checkout and fulfillment.
4. Revoke affected sessions/capabilities/keys and rotate secrets through provider controls.
5. Preserve append-only journals, provider event inbox, deployment/migration IDs, and object hashes.
6. Notify legal/privacy/provider contacts according to the approved incident matrix; statutory conclusions are made by qualified owners.

## Investigation

- Establish the first/last known affected time and systems/organizations/orders.
- Compare immutable audit/payment/inventory/decision records with provider/source evidence.
- Identify whether authorization, jurisdiction, catalog, payment, or fulfillment failed open.
- Verify backups/restore points before destructive remediation.
- Use isolated copies for forensic queries; do not alter primary evidence.

## Recovery

### Application/provider issue

Deploy a reviewed fix, validate in Preview, replay/reconcile idempotently, and reopen capabilities gradually after negative-path tests pass.

### Database issue

Stop protected writes, select a verified point-in-time or logical backup, restore to an isolated Neon branch, validate schema/journal hashes and row counts, reconcile provider events after the restore point, then cut over under an approved recovery decision.

### Object/COA issue

Quarantine affected catalog/lot records, restore an approved object version, verify SHA-256 and authorization, republish only through the normal approval workflow, and hold affected orders.

### Identity compromise

Revoke sessions, disable actor/capabilities, reset/rotate factors, audit decisions/refunds/catalog/policy changes, reverse through new append-only decisions where authorized, and require re-enrollment.

## Resume criteria

- Root cause contained.
- Required secrets/roles fixed.
- Data/provider reconciliation complete or bounded.
- Critical denial and recovery tests pass.
- Monitoring/alerts show stable behavior.
- Compliance/legal/privacy owners approve reopening where relevant.
- Launch gates are reopened individually with evidence; no blanket resume.

## Post-incident

Within the approved window, document timeline, impact, evidence, root cause, contributing controls, corrective actions, owners/dates, notification decisions, and restore/RPO/RTO results. Update threat model, tests, runbooks, and training without deleting historical evidence.
