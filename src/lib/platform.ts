type PlatformJurisdictionDisplayState =
  | "Allowed"
  | "Manual Review"
  | "Blocked"
  | "Unknown";

export const brand = {
  name: "PROPEPTIQ LABS",
  tagline: "Research-use commerce for verified accounts.",
};

export const navigation = [
  { label: "Platform", href: "#platform" },
  { label: "State machines", href: "#states" },
  { label: "Jurisdiction", href: "#jurisdictions" },
  { label: "Launch gates", href: "#gates" },
  { label: "Docs", href: "#docs" },
];

export const operatingRules = [
  "No guest checkout",
  "Unknown jurisdictions default to hold",
  "No human-use, treatment, or dosage claims",
  "Payment success pages never prove payment",
  "Lot-level COAs must be linked before fulfillment",
];

export const platformModules = [
  {
    title: "Verified researcher accounts",
    status: "planned",
    detail:
      "Organizations and individual researchers must pass intended-use review before the catalog can be exposed.",
  },
  {
    title: "Catalog gating",
    status: "planned",
    detail:
      "Every SKU is controlled by a jurisdiction matrix and a compliance state, so unknown locations never slip through.",
  },
  {
    title: "Lot and COA records",
    status: "planned",
    detail:
      "Product pages stay limited to defensible research details, with batch and lot records attached where evidence exists.",
  },
  {
    title: "Order journal",
    status: "planned",
    detail:
      "Order, payment, and refund events are recorded append-only so review and reconciliation remain auditable.",
  },
  {
    title: "Fulfillment hold queue",
    status: "planned",
    detail:
      "Fulfillment only releases after the payment webhook is verified and compliance clearance is explicit.",
  },
  {
    title: "Audit-ready admin",
    status: "planned",
    detail:
      "Admin actions will be protected by MFA and logged centrally so approvals, suspensions, and overrides stay traceable.",
  },
];

export const stateMachines = [
  {
    name: "Researcher approval",
    detail:
      "Access begins with an application and intended-use attestation. The user may be approved, held for review, or rejected.",
    states: ["Submitted", "Pending review", "Approved", "Suspended / rejected"],
  },
  {
    name: "Order lifecycle",
    detail:
      "Orders move through a compliance hold before payment and fulfillment. Anything uncertain stays blocked until a human clears it.",
    states: ["Draft", "Compliance hold", "Payment pending", "Released", "Closed / cancelled"],
  },
  {
    name: "Payment lifecycle",
    detail:
      "Hosted checkout is only one step. A webhook-verified, deduplicated, append-only payment record is the real source of truth.",
    states: ["Initiated", "Webhook verified", "Journaled", "Reconciled", "Refunded / disputed"],
  },
  {
    name: "Fulfillment lifecycle",
    detail:
      "Inventory and lot selection are separated from release. Packing and shipping can only proceed after clearance.",
    states: ["Queued", "Packed", "Shipped", "Delivered", "Exception"],
  },
];

export const jurisdictionMatrix = [
  {
    state: "Allowed" as PlatformJurisdictionDisplayState,
    meaning:
      "The SKU, destination, and buyer state have all been approved. Checkout may continue once other gates pass.",
    outcome: "Proceed",
  },
  {
    state: "Manual Review" as PlatformJurisdictionDisplayState,
    meaning:
      "A human must verify the order. The system keeps the order on hold and does not auto-release it.",
    outcome: "Hold",
  },
  {
    state: "Blocked" as PlatformJurisdictionDisplayState,
    meaning:
      "The SKU or destination is not allowed for this workflow. Checkout stays unavailable.",
    outcome: "Stop",
  },
  {
    state: "Unknown" as PlatformJurisdictionDisplayState,
    meaning:
      "The jurisdiction has not been classified yet. The default behavior is to block and request review.",
    outcome: "Default deny",
  },
];

export const launchGates = [
  {
    title: "Catalog approval",
    detail:
      "The final SKU list, COA coverage, and allowed jurisdictions must be signed off before anything is sold.",
  },
  {
    title: "Payment activation",
    detail:
      "Live card processing stays off until the business rules, compliance flow, and provider review are complete.",
  },
  {
    title: "Auth and admin controls",
    detail:
      "Admin access needs MFA, centralized authorization, and audit logging before operational use begins.",
  },
  {
    title: "Warehouse and shipping matrix",
    detail:
      "Entity, warehouse, and carrier choices remain configurable until the approved shipping map is finalized.",
  },
  {
    title: "Observability and recovery",
    detail:
      "Monitoring, backup, rollback, and incident runbooks must exist before launch can move from staging to production.",
  },
];

export const documentationChecklist = [
  "README setup and local commands",
  "System architecture and diagrams",
  "ADRs for stack and vendor choices",
  "Data model and invariants",
  "Authentication and authorization",
  "Payments, webhooks, refunds, reconciliation",
  "Security, threat model, and secrets handling",
  "Catalog and compliance policy",
  "Jurisdiction matrix",
  "Deployment, migrations, rollback, and backups",
  "Testing strategy",
  "Operational runbooks for holds, refunds, incidents, and recovery",
];

export const stackSelection = [
  {
    name: "Next.js App Router",
    status: "implemented",
    detail: "The scaffold is in place and the UI currently renders from App Router pages.",
  },
  {
    name: "Strict TypeScript",
    status: "implemented",
    detail: "The starter was generated with TypeScript and strict project defaults.",
  },
  {
    name: "Tailwind CSS",
    status: "implemented",
    detail: "The first branded slice uses utility-first styling on the default Tailwind pipeline.",
  },
  {
    name: "shadcn/ui",
    status: "planned",
    detail:
      "The component library will be added in a later slice so form and dialog primitives stay consistent.",
  },
  {
    name: "Clerk with MFA",
    status: "planned",
    detail:
      "Administrator authentication and organization verification remain a launch-gated integration.",
  },
  {
    name: "Neon + Drizzle",
    status: "planned",
    detail:
      "The persistent data layer is intentionally deferred until the data model and migration plan are approved.",
  },
  {
    name: "Stripe Checkout abstraction",
    status: "planned",
    detail:
      "Hosted card capture stays behind a provider interface until the compliance review path is finalized.",
  },
  {
    name: "Object storage + COAs",
    status: "planned",
    detail:
      "Media and lot-level certificates need a storage model before uploads are wired in.",
  },
];
