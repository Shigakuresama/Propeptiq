# Storefront reliability and design refinement

Base: current main d288dc6. Existing dirty worktrees are preserved.
This request supersedes earlier instructions to retain social home-link placeholders,
place newsletter below navigation, and advertise code entry for automatic WINTER30.

## Audit before implementation

- Newsletter: form → API → runtime → database rate gate → Resend global contact/topic.
  Code launch flag is false; approved privacy destinations are empty. Credentials
  alone cannot activate collection. The create-only gateway has no duplicate read.
- Auth: Better Auth 1.6.23, nextCookies last, database-validated sessions, safe returnTo
  allowlist. Public header hardcodes Sign in. Proxy drops returned session renewal
  cookies. RSC cannot reliably write them. Preserve full server validation.
- Checkout: page checks the synthetic-only readiness predicate while API composition
  already supports PostgreSQL/Stripe. Current versioned agreement is loaded from
  attestation_versions, never inferred from public policy prose.
- Promotion: automatic 30% WINTER30; no code field or extra Stripe promotion code.
  Keep this behavior and render APPLIED AUTOMATICALLY from the validated projection.
- Growth: existing signed attribution, eligibility, idempotent processing, immutable
  point ledger and separate cash commission/payout ledger remain authoritative.
  Improve shared route navigation and inactive program discovery, without economics.

## Work and verification

1. Repair session presentation/renewal and checkout readiness; regress redirects,
   revoked sessions, protected routes and configured/closed checkout.
2. Finish provider duplicate handling and truthful newsletter validation/feedback.
3. Shared uppercase headings, promotion hierarchy, teal brand accent, pre-footer,
   social colors for real links, feature/FAQ surfaces, cohesive growth navigation.
4. Run workspace, lint, types, unit, integration, browser and production build gates.
   Inspect responsive output and reduced motion. Record external blockers separately.

No legal text, program economics, real inventory or provider approval is fabricated.
