# ADR 0005: Email, Observability, and Rate Limiting

- **Date:** 2026-08-24
- **Status:** Accepted target design; only the durable-effect library boundary is implemented

## Context

The system needs transactional notices, operational traces/logs, alertable security events, and layered abuse protection without placing those vendors in the business source-of-truth path.

## Target decision

Use Resend behind a transactional-email interface and durable outbox. Use structured JSON logs with explicit redaction, `@vercel/otel`, Vercel Observability, and Vercel Firewall rate limits. Application-level actor/resource limits and idempotency should protect sensitive mutations beyond coarse IP limits.

Email failure must never reverse a durable decision/payment event. The target worker is scheduled and authenticated, acquires expiring leases, sends with a stable provider idempotency key, records attempts, retries with bounded exponential backoff, and moves exhausted messages to an alertable dead-letter state. Target logs/traces contain correlation IDs, not secrets, document content, card data, or unnecessary PII. Audit records remain in Postgres.

## Current implementation checkpoint

Implemented code provides a durable downstream-effect repository and a
lease-aware worker factory exercised with injected test sinks. Some
application mutation paths have database-backed actor/resource rate limits.
The repository does **not** yet provide a runtime scheduler or wake-up path, a
production sink or Resend delivery, bounded backoff/dead-letter operations,
alerts, a structured telemetry pipeline, external Vercel Firewall
configuration, or webhook rate limiting. Each applicable missing control is a
launch blocker; repository/worker tests do not prove any of those operations.

## Consequences

- The design separates operational telemetry from immutable audit evidence;
  production telemetry remains unimplemented.
- Vercel/Resend plan limits, sender verification, retention, alerts, and rate
  rules require implementation, production configuration, and test evidence.
- Provider outages must degrade notifications/telemetry without permissive
  compliance behavior once those providers are integrated.

## Alternatives

- Direct email inside business transactions: rejected due to partial-failure and duplicate-send risk.
- Logs as audit history: rejected because retention/mutability are unsuitable.
- IP-only rate limiting: rejected because shared networks and authenticated abuse require resource-aware limits.
