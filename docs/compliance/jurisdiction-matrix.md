# Product-by-Jurisdiction Matrix

**Status:** Architecture approved for implementation; all product decisions are unresolved and therefore default to `Unknown`.

## 1. Scope

Initial geographic scope is the 50 U.S. states and Washington, D.C., only where each SKU and destination are actually allowed. U.S. territories are outside the initial automatic-approval scope and require an explicit policy; absent policy remains `Unknown`.

Wyoming is only a provisional entity-formation candidate. Entity formation does not determine product legality or create a peptide-law exemption.

## 2. Decision values

| Value | Meaning | Checkout behavior |
|---|---|---|
| `Allowed` | Current evidence-backed policy permits this SKU to this destination, subject to all other gates | Continue evaluating |
| `Manual Review` | A reviewer must decide this exact buyer/SKU/destination case | Create hold; no checkout |
| `Blocked` | Current policy prohibits the transaction | Deny; no checkout |
| `Unknown` | Evidence/policy is absent, expired, contradictory, or evaluator failed | Deny and route for policy review; no checkout |

There is no implicit `Allowed`, wildcard allow, “rest of U.S.” allow, or fallback from a neighboring jurisdiction.

## 3. Jurisdiction identity set

The database may seed jurisdiction identity codes/names for validation, but identity rows do not grant permission. Product rules are separate records. The initial product-rule set is empty, which evaluates to `Unknown` for every product/destination combination.

States/DC identity scope: AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, and DC.

Territory identity records may include AS, GU, MP, PR, and VI, but no automatic rule is inferred. A future approved policy may choose `Manual Review` for territories.

## 4. Separate gates

The matrix does not collapse these questions:

1. **Product legality:** Is this SKU lawful for the destination under the actual facts?
2. **Payment-provider eligibility:** Will the approved provider process this catalog/transaction?
3. **Tax:** Is registration/nexus/configuration complete and can tax be authoritatively calculated?
4. **Buyer verification:** Is this researcher/organization currently approved for the SKU/purpose?
5. **Shipping:** Is the address/service/product combination approved and operationally supported?
6. **Inventory/lot:** Is a released, documented lot available?
7. **Compliance clearance:** Is there no active hold and is the evidence current?

Each produces its own result/evidence. The aggregate passes only when every gate passes.

## 5. Policy record

Each product/jurisdiction rule contains:

- product and jurisdiction identifiers,
- decision value,
- reason code and plain-language rationale,
- evidence/source references,
- legal/compliance approver,
- effective timestamp,
- review/expiry timestamp,
- policy version/content hash,
- superseded rule reference where applicable.

Expired or superseded rules do not fall back to `Allowed`; they evaluate `Unknown` until replaced.

An exact-case manual-review decision is a separate, append-only record scoped to the buyer principal/organization, product, destination, intended-use version, and underlying policy version. An approved, unexpired decision converts only that case’s product-jurisdiction gate to `PASS`; it does not change the base `Manual Review` rule or authorize another buyer/order. A rejected decision yields `Blocked`. A missing, expired, superseded, or mismatched case decision remains `Manual Review` or `Unknown` and cannot proceed.

## 6. Evaluation algorithm

```text
if product is not approved and active: Blocked
if no active exact product + destination rule: Unknown
if rule evidence is expired or integrity check fails: Unknown
if rule is Manual Review and no exact current case decision exists: Manual Review
if exact case decision is rejected: Blocked
if exact case decision is approved and matches buyer, product, destination, purpose, and policy version: Pass for this gate
otherwise use the exact rule value
evaluate provider, tax, buyer, shipping, lot, compliance, and launch gates independently
if any gate is Blocked: aggregate Blocked
else if any gate is Unknown: aggregate Unknown
else if any gate is Manual Review: aggregate Manual Review
else aggregate Allowed/Pass
```

Checkout and post-payment fulfillment re-evaluate using current policy while retaining the original snapshot for audit.

## 7. Operations

- Policy changes require authorized review, recent MFA, reason, evidence, and append-only audit history.
- Changes from Allowed to a restrictive state immediately block new checkout and place unpaid/paid-unfulfilled affected orders on hold.
- A batch report enumerates products with missing, expiring, or contradictory rules; it never auto-fills them.
- Customer support cannot override the matrix.
- Legal counsel must approve the actual SKU/destination matrix before any production sale.
