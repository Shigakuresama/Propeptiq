# Testing Strategy

## Test layers

- **Domain unit tests:** automatic buyer activation, exact gate decisions/reason codes, destination precedence, explicit review snapshots, content/publication policy, price/promotion calculations, order/payment/inventory/refund/fulfillment transitions.
- **Repository integration tests:** Drizzle queries and constraints against an isolated database, guarded migrations, provider event/hash uniqueness, concurrent inventory/refund/shipment behavior.
- **Adapter contract tests:** Clerk verification projection, Stripe raw-body signature verification and idempotency, Blob authorization, email outbox behavior.
- **Component/browser tests:** public catalog/prices/promotions/cart, preserved cart through sign-in, account attestation, own-order authorization, staff MFA/capability denial, read-only success route, safe empty/error states.
- **Responsive/accessibility tests:** 375px, 768px, 1024px, and 1440px; keyboard-only; visible focus; reduced motion; 200% zoom; no horizontal overflow; accessible navigation sheet and Proof Rail.

## Required negative cases

- Unverified email, under-21/no confirmation, invalid purpose, or stale/missing attestation.
- Buyer `blocked`; buyer `review` without matching exact snapshot; snapshot changed by cart, buyer status, attestation, or destination.
- Territory, exact blocked product override, blocked group rule, or missing destination rule; missing policy does not create review.
- Inactive product/price/lot, insufficient inventory, missing allowed destination, or analytical claim without corresponding evidence.
- Production test-fixture/demo mode, browser price/promotion tampering, unavailable tax/shipping, disabled/unaccepted provider.
- Invalid webhook signature, duplicate event, same event ID with conflicting hash, out-of-order event, success-page refresh.
- Concurrent over-reservation, over-refund, or duplicate fulfillment release/shipment.
- Cross-user order/object access, nonstaff route access, missing MFA, insufficient staff capability.
- Human/veterinary outcome, dosing, administration, reconstitution, treatment, or misleading overall-impression content.

## Documentation checks

The binding-document search covers README, design-system, active requirements/traceability, compliance, architecture, ADRs, security, testing, deployment, runbooks, and design contracts. It may exclude files explicitly labeled historical or superseded. Findings must distinguish a prohibited active requirement from text that explicitly rejects that requirement.

## Local gate and evidence

For documentation-only Task 1, run:

```powershell
npm run verify:workspace-boundary
npm test
npm run lint
git diff --check
```

Later release work also needs strict TypeScript, database generation/check/integration tests, browser tests, production build, dependency audit, migration review, and environment-specific checks. A skipped or unavailable command is not a pass. Record exact commands, exit codes, test counts where printed, routes/viewports exercised, and unresolved external checks. Local results never establish legal or provider approval.
