# PROPEPTIQ UI refinement v4 plan

**Release branch:** `ui/refinement-v4-release`

**Audit baseline:** `716fa79dcd7926820952ea5ed04ab3e9cf03ef1d`

**Release base:** `c2c8307882c9f13d0fd90e63613c18019cc83657`

## Objective

Elevate PROPEPTIQ into a cohesive premium scientific/editorial interface while preserving every existing behavior, truth boundary, accessibility requirement, and server-authoritative commerce decision.

## Execution status

**UI scope:** completed on 2026-08-29.

- Phases A-F were implemented on `ui/refinement-v4`, then transplanted as the exact 60-path UI, regression-test, and isolated-browser-harness change onto the current squash-merged `main` tree in `ui/refinement-v4-release`.
- Three independent reviews found no remaining actionable UI, accessibility, authority-boundary, or business-logic defects after their findings were resolved.
- The optimized Next.js build, production artifact scan, workspace-boundary check, TypeScript check, changed-file lint, and diff check pass.
- The clean release-branch unit run passes all 1,408 tests across 136 files.
- Independent pre-merge review found one remaining full-lockup-in-a-symbol-frame issue in private shell branding; the account, administration, authentication, and mobile navigation surfaces now use the full lockup at a legible width without duplicated brand text.
- Repository-wide lint and TypeScript checks pass on the current-main release branch.
- Browser verification found no serious or critical Axe findings, no horizontal overflow at the binding widths, a working mobile Sheet close path, and a single functional empty-result reset. The unconfigured production runtime remains truthfully fail-closed with zero published catalog records.

## Phase A — audit and baseline

- Capture representative states at 375, 768, 1024, and 1440 pixels.
- Record hierarchy, spacing, responsiveness, state, accessibility, and system gaps.
- Establish unit/lint/typecheck/Playwright baseline and separate pre-existing failures from regressions.

**Gate:** completed in `docs/design/ui-refinement-v4-audit.md`.

## Phase B — system and shell

- Refine surface, spacing, interaction, and focus tokens without replacing the approved identity.
- Add only repeated, presentational primitives: section shell, data label, record surface, notice, status, skeleton, metric, and empty state.
- Refine public header, active navigation, restriction context, footer hierarchy, page intros, and Proof Rail.

**Gate:** component tests, public shell semantics, keyboard Sheet behavior, Axe, and visual review.

## Phase C — public storefront

- Recompose the homepage into editorial hero, evidence relationship, featured catalog, documentation model, research-use statement, and final catalog action.
- Refine catalog discovery and browse cards as a scientific index.
- Refine browse and active product pages as dossiers without inventing facts.
- Make Quality Records a deliberate archive/document interface with truthful populated and empty states.

**Gate:** public route tests, 56/103 browse assertions, no prices/add-to-cart in browse mode, screenshots at all binding widths.

## Phase D — commerce, authentication, and account

- Calm cart and checkout hierarchy; preserve local-ID/server-fact boundaries, field names, error focus, stale acknowledgement, redirects, idempotency, and exact synthetic labels.
- Add a branded access shell around sign-in/sign-up.
- Refine account navigation, facts, rewards/referrals, orders, order detail, and empty states.

**Gate:** focused component/unit tests plus public, account, and commerce Playwright flows.

## Phase E — admin

- Refine admin shell, active navigation, dashboard cards, record grouping, statuses, notices, and form presentation.
- Do not rewrite resource command semantics, authorization checks, action payloads, or destructive safeguards.

**Gate:** admin component tests and representative authorized/denied Playwright flows at mobile and desktop widths.

## Phase F — final polish and verification

- Verify 375, 768, 1024, 1440, 200% zoom proxy, keyboard-only navigation, reduced motion, touch targets, contrast, and horizontal overflow.
- Run focused tests after each phase, then repository lint, typecheck, unit/integration, build, artifact scans, and relevant Playwright suites.
- Inspect final screenshots against the baseline and run an adversarial diff review.

## Non-goals

- No backend, database, provider, catalog-authority, payment, fulfillment, security, or policy redesign.
- No invented products, prices, purity, labs, lots, COAs, inventory, promotions, testimonials, certifications, shipping promises, or medical/human-use positioning.
- No new animation dependency, hotlinked asset, generic SaaS dashboard aesthetic, glassmorphism system, or decorative checkout/admin motion.
