export const siteName = "PROPEPTIQ LABS";

export const publicNavigation = [
  { label: "Research Catalog", href: "/catalog" },
  { label: "Quality Records", href: "/quality-records" },
  { label: "Research-Use Policy", href: "/research-use-policy" },
  { label: "Researcher Access", href: "/access" },
] as const;

export const researchRestrictions = [
  "For legitimate laboratory and research use only.",
  "Not for human or veterinary use.",
] as const;

export const proofStages = [
  "Material identity",
  "Analytical method",
  "Lot/batch",
  "COA state",
] as const;

export const plannedControls = [
  {
    title: "Lot-linked documentation",
    detail:
      "Designed to connect approved public facts to the specific lot and evidence record that supports them.",
  },
  {
    title: "Verified-account access",
    detail:
      "Designed to require researcher or organization review before any eligible ordering path can open.",
  },
  {
    title: "Jurisdiction-aware ordering",
    detail:
      "Designed to evaluate each product and destination independently, with unknown states blocking checkout.",
  },
] as const;

export const accessSteps = [
  {
    number: "01",
    title: "Apply",
    detail:
      "A researcher or organization submits its intended research purpose and required supporting information.",
  },
  {
    number: "02",
    title: "Review",
    detail:
      "Account review establishes access status; it does not make every material or destination eligible.",
  },
  {
    number: "03",
    title: "Eligibility check",
    detail:
      "Buyer, product, destination, provider, tax, shipping, inventory, and compliance gates are evaluated separately.",
  },
  {
    number: "04",
    title: "Fulfillment clearance",
    detail:
      "Fulfillment requires verified payment plus current compliance clearance. A redirect never proves payment.",
  },
] as const;
