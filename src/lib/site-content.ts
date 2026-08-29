export const siteName = "PROPEPTIQ LABS";

export const publicNavigation = [
  { label: "Catalog", href: "/catalog" },
  { label: "Quality Records", href: "/quality-records" },
  { label: "Research Use", href: "/research-use-policy" },
  { label: "Rewards", href: "/rewards" },
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
