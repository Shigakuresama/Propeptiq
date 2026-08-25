# ADR 0005: Email, Observability, and Rate Limiting

- **Date:** 2026-08-24
- **Status:** Accepted for implementation; vendor accounts and production rules gated

## Context

The system needs transactional notices, operational traces/logs, alertable security events, and layered abuse protection without placing those vendors in the business source-of-truth path.

## Decision

Use Resend behind a transactional-email interface and durable outbox. Use structured JSON logs with explicit redaction, `@vercel/otel`, Vercel Observability, and Vercel Firewall rate limits. Application-level actor/organization/resource limits and idempotency protect sensitive mutations beyond coarse IP limits.

Email failure never reverses a durable decision/payment event. A scheduled, authenticated outbox worker acquires expiring leases, sends with a stable provider idempotency key, records attempts, retries with bounded exponential backoff, and moves exhausted messages to a dead-letter state that alerts operators. Logs/traces contain correlation IDs, not secrets, document content, card data, or unnecessary PII. Audit records remain in Postgres.

## Consequences

- Clear separation between operational telemetry and immutable audit evidence.
- Vercel/Resend plan limits, sender verification, retention, alerts, and rate rules require production configuration and test evidence.
- Provider outages degrade notifications/telemetry without permissive compliance behavior.

## Alternatives

- Direct email inside business transactions: rejected due to partial-failure and duplicate-send risk.
- Logs as audit history: rejected because retention/mutability are unsuitable.
- IP-only rate limiting: rejected because shared networks and authenticated abuse require resource-aware limits.
