# Authentication and Authorization

**Status:** Proposed control design; production Clerk configuration is a launch gate.

## 1. Authentication

Clerk is the managed identity provider. The application uses `@clerk/nextjs` in the App Router, with Clerk Organizations for buyer organizations and membership context.

Production settings:

- Require MFA for all users; this safely exceeds the minimum administrative requirement and avoids a weak role-specific enrollment gap.
- Prefer authenticator app/passkey-capable methods; backup codes enabled. SMS is not the sole administrative factor.
- Disable uncontrolled organization creation/invitations unless the approval workflow explicitly permits them.
- Treat incomplete session tasks as unauthenticated for protected routes.
- Require recent strict MFA reverification for application review, payment reconciliation, approvals, suspensions, catalog publication, jurisdiction changes, launch-gate changes, refunds, and staff grants. Reverification must be no earlier than the active session's authentication time.
- Use separate development and production Clerk instances.

Clerk proves identity and organization context. It does not prove researcher status, SKU eligibility, jurisdiction legality, payment-provider eligibility, tax status, shipping eligibility, or compliance clearance.

## 2. Principal model

Every protected server operation begins by resolving:

```ts
type Principal = {
  actorId: string
  clerkUserId: string
  organizationId: string | null
  clerkOrganizationId: string | null
  status: 'active' | 'incomplete' | 'suspended'
  capabilities: readonly Capability[]
  authentication: {
    authenticatedAt: Date
    mfaSatisfied: boolean
    reverificationAt: Date | null
  }
}
```

The adapter validates Clerk identifiers, then loads the actor, organization membership, staff grants, suspension status, and capability set from Neon. Client claims/public metadata never directly grant application capabilities.

## 3. Capabilities

```ts
type Capability =
  | 'application:read:self'
  | 'application:read:organization'
  | 'application:submit:self'
  | 'application:review'
  | 'compliance:decide'
  | 'catalog:draft'
  | 'catalog:publish'
  | 'jurisdiction:manage'
  | 'order:read:self'
  | 'order:read:organization'
  | 'order:read:any'
  | 'payment:reconcile'
  | 'refund:request'
  | 'fulfillment:release:consume'
  | 'membership:manage:organization'
  | 'staff:manage'
  | 'launch-gate:manage'
```

Role names are conveniences; server checks target exact capabilities and resource scope.

`compliance:decide` covers hold placement/release and exact-case decisions. The server still authorizes the exact operation and resource relation independently and requires step-up evidence.

## 4. Central enforcement

`requirePrincipal()` rejects missing/incomplete/suspended identity. `requireOperation(operation, resource)` loads the immutable operation policy, checks its exact capability and permitted resource relation, and—when the operation is sensitive—requires current server-loaded strong-auth policy plus recent strong authentication. DAL functions require a `Principal`; they do not accept raw Clerk IDs from route code.

Resource authorization declares one relation: owner actor, matching organization, or deliberately capability-only staff scope. Capability-only resources also project the subject actor, subject organization, and creator actor when applicable; missing context denies reviewer/applicant and drafter/publisher checks. A server-owned operation matrix fixes the capability, allowed relation, separation rule, and step-up requirement; route callers cannot override it. Missing/malformed policy or scope denies. Cross-organization staff access never derives from a buyer role or client-provided organization ID. The strong-auth policy is an evidence-backed server configuration with bounded age; the server adapter supplies a separate approved platform ceiling, and missing/expired/unsafe configuration disables sensitive operations.

Example interface:

```ts
export async function requireOperation(
  principal: Principal,
  operation: AuthorizationOperation,
  resource: ResourceScope,
  context: {
    now: Date
    strongAuthPolicy: StrongAuthPolicy | null
    strongAuthMaximumAgeCeilingMs: number | null
  },
): Promise<AuthorizedPrincipal>
```

Route protection is defense in depth. Hiding a button or guarding a page is not authorization; every Server Action and route handler repeats the server policy check.

## 5. Resource rules

| Resource | Buyer/member | Organization admin | Compliance | Finance | Fulfillment | Platform admin |
|---|---|---|---|---|---|---|
| Own application | Read/submit | Read org applications | Review/decide | None | None | Read |
| Catalog public record | Read approved | Read approved | Read | Read | Read | Read |
| Catalog draft | None | None | Review evidence | None | Read operational | Draft/publish only with capability |
| Own order | Read | Read org orders | Read/hold | Reconcile/refund | Read released | Read |
| Other organization | None | None | Minimum needed for review | Minimum needed for finance | Released fields only | Capability-scoped |
| Jurisdiction/launch controls | None | None | Decide with capability | Read provider gate | Read shipping gate | Manage with step-up |

Staff functions use least privilege and separation of duties. A catalog drafter must not be the sole publisher of the same version. An applicant cannot approve their own organization. A refund requester and high-value refund approver may be separated once thresholds are approved.

## 6. Webhooks and service principals

Provider webhooks do not use Clerk. They authenticate through exact provider signature verification, then run as a restricted service principal with only event-ingest/payment-transition capability. Scheduled reconciliation and backup tasks use separately scoped service credentials and record an audit actor type.

## 7. Security tests

- Anonymous, wrong-organization, suspended, expired, and incomplete-MFA principals are denied.
- Manipulated organization IDs never widen scope.
- Every sensitive action fails without the exact capability and recent strong authentication.
- Clerk role/metadata changes alone cannot grant database capabilities.
- Webhook routes reject missing/invalid signatures before parsing trusted event data.
- Service principals cannot call unrelated staff operations.

## 8. Launch verification

Before production, verify required MFA in the Clerk dashboard, create staff accounts through a controlled ceremony, test loss/recovery of factors, verify organization creation/invitation policy, record break-glass ownership, and confirm all administrative routes enforce step-up on the server.
