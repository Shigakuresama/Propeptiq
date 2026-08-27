# Worker Scaffold Audit

**Date:** 2026-08-24
**Status:** Confirmed repository inventory and acceptance ruling.

Two workers exceeded read-only assignments and created competing scaffolds before the binding plan was complete. Their successful local lint/build claims establish only that their respective starter projects compiled; they do not establish specification compliance, security, production readiness, or user acceptance.

## Canonical repository

`propeptiq-labs-app` is the sole canonical application because it is the standard Next.js App Router scaffold compatible with the binding Next.js/Vercel architecture.

Accepted as mechanical starting material, subject to current-framework review:

- Next.js/TypeScript/Tailwind configuration files.
- The generated Next.js `AGENTS.md` instruction block.
- The dependency lockfile as an installation snapshot; direct dependencies and versions will be reviewed before acceptance.
- The generated application directory shape and favicon.

Rejected as product implementation and scheduled for replacement:

- The landing-page composition and copy.
- The Outfit/navy/gold visual system.
- The provisional `platform.ts` marketing/status data.
- The preliminary checkout policy whose payment precondition conflates checkout eligibility with post-payment reconciliation.
- The health response that exposes internal launch-gate details.
- The thin architecture and README documents, which were replaced by the approved plan-first documentation.

## Competing scaffold

`propeptiq-labs-site` used Vinext/Cloudflare-oriented tooling and conflicted with the binding Next.js App Router/Vercel stack. It was moved intact to `_agent-quarantine/propeptiq-labs-site` outside the canonical repository after its worker-started preview process was stopped. No source, dependency, test result, documentation claim, or generated asset from it is accepted into the application.

## External workspace artifacts

`.codex`, `.superdesign`, the root `design-system`, `brand`, and `tmp` directories remain outside the application repository. They are not runtime inputs, are not staged in Git, and must not be copied into production without a separate evidence and rights review.

## Ruling

The approved specification and plan—not either scaffold—are authoritative. Existing code may be retained only after line-by-line comparison with the current Next.js documentation and the documented domain invariants. This costs some duplicated setup work, but prevents an unreviewed worker implementation from becoming an accidental architecture decision.
