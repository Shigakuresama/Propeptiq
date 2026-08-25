# Test Strategy

**Status:** Binding verification plan.

## 1. Test layers

- **Unit:** pure domain state transitions, eligibility aggregation, pricing, capability policy, content rules, redaction.
- **Property/table tests:** all gate combinations, state-machine transition matrix, integer totals, inventory invariants.
- **Database integration:** migrations, constraints, tenant scoping, append-only triggers, concurrency, unique idempotency/event/release rules.
- **Provider contract:** disabled adapters, Stripe signature/idempotency mapping, Blob authorization, Resend outbox behavior.
- **Component/accessibility:** forms, status displays, empty/loading/error states, keyboard/focus, reduced motion.
- **Browser:** public pages, protected-route denial, applicant flow, reviewer flow, catalog empty state, checkout denial, success-page read-only behavior, responsive layouts.
- **Operational:** backup restore, reconciliation exception detection, incident/hold/refund runbooks.

Test data is clearly labeled synthetic and exists only under test directories/isolated resources. Production migrations do not seed products, prices, labs, COAs, purity, stock, approvals, or customer identities.

## 2. Required denial tests

- Anonymous checkout.
- Unapproved, rejected, suspended, or expired buyer.
- Wrong organization/resource ID.
- Missing/expired/Unknown/manual-review/blocked jurisdiction rule.
- Closed provider/tax/shipping/catalog/launch gate.
- Missing/expired lot or COA approval.
- Browser price/name/total manipulation.
- Stale attestation or policy version.
- Missing/replayed/invalid webhook signature.
- Duplicate/concurrent provider event.
- Payment amount/currency/customer mismatch.
- Success-page attempt to mutate payment.
- Paid order with changed compliance state.
- Fulfillment without/after consumed release.
- Admin action without capability or recent strong authentication.

## 3. Quality commands

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run db:check
git diff --check
```

Focused tests run during development; the full set runs before completion/deployment. A skipped test is not a pass and must state why, owner, and gate impact.

## 4. Browser matrix

- Chromium desktop at 1440px and 1024px.
- Chromium tablet/mobile at 768px and 375px.
- Keyboard-only navigation and visible focus.
- Reduced-motion emulation.
- Cross-browser smoke in current Firefox/Safari through the chosen CI/device service before commerce launch.

## 5. Accessibility

- Semantic landmarks/headings and labeled controls.
- WCAG 2.2 AA contrast and focus appearance.
- Error summary plus inline associations.
- Status not communicated by color alone.
- Dialog/Sheet focus trap and return.
- Touch targets and no horizontal scroll at 375px.
- Automated axe checks plus manual keyboard/screen-reader smoke.

## 6. Payment verification

Use Stripe test/sandbox only after provider adapter implementation. Generate valid test signatures with official tooling/SDK; never hardcode live keys. Verify duplicate and out-of-order events, retries after transient failure, asynchronous states if enabled, refunds, disputes, and reconciliation. No real customer/staff notification or shipment is triggered by tests.

## 7. Completion evidence

The release report records exact commands, exit codes, relevant browser routes/viewports, migration IDs, and unresolved environment-dependent checks. Production claims are made only from production evidence, never inferred from local tests.
