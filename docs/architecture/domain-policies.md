# Pure Domain Policy Contracts

**Status:** Binding contract for the pure policy layer. Business-specific values remain launch-gated configuration, not code defaults.

## 1. Shared result and evidence conventions

Pure domain functions are deterministic, side-effect free, and return discriminated results rather than throwing for expected denials:

```ts
type Result<Value, Error> =
  | { ok: true; value: Value }
  | { ok: false; error: Error }

type EvidenceReference = {
  kind: string
  id: string
  version: string
  sha256: string | null
}
```

Identifiers, versions, and evidence kinds must be nonblank. When a hash exists, it is a lowercase 64-character SHA-256 hex digest. Pure results and nested arrays are readonly and frozen before crossing a server boundary.

Domain/database enum values use lowercase `snake_case`; user-facing labels are explicit presentation mappings. Jurisdiction policy values remain the required title-cased external values: `Allowed`, `Manual Review`, `Blocked`, and `Unknown`.

## 2. Eligibility and jurisdiction

The independent gate keys are exactly those in `data-model.md`. Generic gate states are `pass`, `manual_review`, `blocked`, and `unknown`. Jurisdiction conversion is exact:

| Jurisdiction value | Gate state |
|---|---|
| `Allowed` | `pass` |
| `Manual Review` | `manual_review` |
| `Blocked` | `blocked` |
| `Unknown` | `unknown` |

An aggregate must contain exactly one result for every required gate. Missing, duplicate, malformed, or evaluator-error results are represented as `unknown`; they never disappear and never pass. Precedence is `blocked` > `unknown` > `manual_review` > `pass`. An empty input therefore evaluates `unknown`. Every gate carries a stable reason code and evidence references; the aggregate preserves per-gate detail.

Unknown and manual-review outcomes both require a compliance hold and prevent checkout. `manual_review` routes the exact buyer/order snapshot to case review. `unknown` also routes the responsible policy/configuration/evaluator gap to policy review. A blocked outcome denies checkout and records its reason; operational escalation is selected by the later server workflow, not hidden inside the pure function.

An exact jurisdiction rule passes only when the product is approved and active, the rule is current and integrity-verified, and required evidence exists. Missing/expired/superseded/integrity-failed rules are `unknown`. A base manual-review rule remains `manual_review` unless a current decision matches the same order ID, order-line ID, exact jurisdiction-rule ID, and immutable eligibility-evaluation hash. A matching rejection is `blocked`; a matching approval with decision evidence is `pass`. A missing, expired, superseded, or mismatched case decision cannot alter the base rule. Mixed-SKU orders evaluate and resolve every line independently before aggregation.

Task 8 will compute the immutable evaluation fingerprint as lowercase SHA-256 over UTF-8 bytes of RFC 8785 JSON Canonicalization Scheme output. Version `eligibility-input-v1` contains only inputs: `{ version, buyer: { actorId, organizationId }, destinationHash, attestationVersion, lines, gateInputs }`. `lines` is sorted by order-line ID and each entry contains `{ orderLineId, productId, quantity, priceBookId, priceVersion, jurisdictionRuleId }`. `gateInputs` is sorted by gate key and contains the exact policy/configuration/evidence IDs and versions read by that evaluator. The aggregate outputs, compliance case, manual-review decision, and decision evidence are excluded so the resolving decision cannot recursively change the fingerprint it references. Changing any bound input requires a new evaluation and invalidates a prior case decision.

## 3. Authorization

The server-resolved principal includes lifecycle state `active`, `incomplete`, or `suspended`. Only `active` can authorize. Authorization receives a named operation, and a server-owned immutable operation-policy table derives the exact capability, allowed relation, and assurance requirement. Route/action callers cannot choose or weaken these values. Each resource carries one explicit relation:

- `owner`: the principal actor must equal the resource owner;
- `organization`: both organization IDs must be non-null and equal;
- `capability_only`: scope is intentionally cross-organization/platform and is accepted only for operations whose built-in policy permits it.

The default for an absent/malformed relation or an operation/relation mismatch is deny. Self-only capabilities can never be upgraded with `capability_only`. Callers cannot infer scope from a UI role or Clerk metadata.

Sensitive operation policies always require MFA plus reverification. The maximum age comes from a current, evidence-backed, server-loaded strong-auth policy record; route input cannot supply it. If that record is missing, expired, malformed, or exceeds the platform security ceiling established before staff activation, the operation is disabled. Current time is an explicit trusted server input. `compliance:decide` covers evidence-backed hold placement, hold release, and exact-case decisions; each named operation still constrains resource relation independently.

The initial operation matrix is explicit: self application/order operations permit `owner`; organization application/order operations permit `organization`; staff application review, compliance decisions, catalog publication, jurisdiction management, payment reconciliation/refund, fulfillment-release consumption, staff management, and launch-gate management use only the relation encoded for that operation. Sensitive mutation rows require the strong-auth policy above. Adding a relation is a reviewed code/policy change, never a caller option.

## 4. Money and quantity

Money uses nonnegative safe-integer minor units and an uppercase three-letter ISO-style currency code. The pure layer does not assume USD or any approved currency. Every calculation receives an approved policy containing:

- a non-empty currency allowlist,
- maximum quantity per line,
- maximum line count,
- maximum order amount in minor units.

All limits must be positive safe integers. Quantity is a positive safe integer; zero, fractions, negatives, values above policy, and unsafe integers fail. Inputs must share one exact currency. Addition and multiplication use checked safe-integer arithmetic and fail before overflow. A persisted price snapshot contains the product ID, price-book row/version, currency, unit amount, quantity, and calculated line total; browser totals are never inputs.

## 5. Order, payment, and fulfillment-release transitions

Transitions accept a current immutable snapshot plus an explicit event and return either a new frozen snapshot or a typed error. They never mutate input.

The documented order graph is authoritative with one explicit recovery edge: `paid_on_hold` may move to `ready_for_fulfillment` only after a fresh all-pass evaluation and issuance of a current fulfillment release referencing verified payment and the new clearance. A pre-carrier-handoff order placed on hold may follow the same recovery path. A signed/provider-retrieved authoritative Checkout expiration maps `checkout_pending` to `payment_failed` with reason `checkout_expired`, then releases its reservation idempotently; a browser cancel redirect cannot make that transition. No browser success redirect event exists.

Payment state is separate. A verified payment requires amount and currency equality with the order snapshot. Refund recording derives `partially_refunded` or `refunded` from verified cumulative refund versus paid amount; over-refund, negative, unsafe, mismatched-currency, and non-provider evidence fail. Disputed and fully refunded states are terminal in the initial graph; a later approved policy must add any recovery transition explicitly.

A fulfillment release is absent, issued, revoked, expired, or consumed. Issuance/re-issuance requires verified payment and a current all-pass clearance, with both evidence references. An issued release may be revoked, expired, or consumed exactly once. Revoked/expired releases may be re-issued with a new clearance reference and monotonically increasing version; consumed is terminal. Consumption requires an atomic current-eligibility recheck in Task 9.

## 6. Public-copy defense in depth

The scanner normalizes Unicode (NFKC), case, punctuation spacing, and whitespace before applying explicit prohibited-language patterns for dosage, administration, reconstitution/injection, treatment, weight loss, bodybuilding, anti-aging, therapeutic or structure/function claims, and human/veterinary outcomes. Exact approved negative research-use disclaimers are neutralized only as scanner input so the disclaimer itself does not trigger; surrounding prohibited claims remain detectable.

The scanner requires a current, integrity-verified, versioned publication-policy input. That trusted server projection contains the exact approved negative-disclaimer strings and approved evidence projections, each with its evidence reference plus approval ID/version. Missing, expired, malformed, or unverified publication policy blocks publication; callers cannot hardcode or submit their own exception list.

Structured factual claims supplied for publication must reference an approved evidence projection from that policy input. A merely nonblank evidence ID is insufficient. Missing or non-approved evidence yields `unsupported_claim`. Absolute marketing language such as guarantees or unsupported superlatives is also blocked. Any violation prevents automatic publication and requires compliance correction/review. The scanner is defense in depth, not a legal or scientific truth engine; passing it never substitutes for independent publication approval.
