export const compoundStudyDesignLabels = Object.freeze({
  animal_experimental: "Animal experiment",
  human_interventional: "Human interventional study",
  human_observational: "Human observational study",
  human_pharmacokinetic_pharmacodynamic: "Human pharmacokinetic/pharmacodynamic study",
  human_pilot: "Human pilot study",
  human_safety_pilot: "Human safety pilot study",
  multicenter_clinical_trial: "Multicenter clinical trial",
  pooled_randomized_controlled_trials: "Pooled randomized controlled trials",
  preclinical_experimental: "Preclinical experiment",
  randomized_controlled_trial: "Randomized controlled trial",
  retrospective_observational: "Retrospective observational study",
} as const);

export const compoundEvidenceContextLabels = Object.freeze({
  animal: "Animal research",
  human: "Human research",
  in_vitro: "In vitro research",
  preclinical: "Preclinical research",
} as const);

export const compoundEvidenceLabels = Object.freeze({
  animal_only: "Animal research only",
  human_meta: "Human evidence synthesis included",
  human_observational: "Human research included",
  human_rct: "Randomized human research included",
  in_vitro_only: "In vitro research only",
} as const);

export type StudyDesign = keyof typeof compoundStudyDesignLabels;
export type EvidenceContext = keyof typeof compoundEvidenceContextLabels;
export type StrongestEvidence = keyof typeof compoundEvidenceLabels;

export type PublicCompoundStudy = Readonly<{
  id: string;
  pmid: string;
  url: string;
  title: string;
  firstAuthor: string;
  year: number;
  journal: string;
  design: StudyDesign;
  evidenceContext: EvidenceContext;
  sampleSize: number | null;
  population: string | null;
  duration: string | null;
  doi: string | null;
}>;

export type PublicCompoundResearchEntry = Readonly<{
  id: string;
  productSlug: string;
  displayName: string;
  alternateNames: readonly string[];
  strongestEvidence: StrongestEvidence;
  identityCaveat: string | null;
  studies: readonly PublicCompoundStudy[];
}>;

export type PublicCompoundResearch = Readonly<{
  schemaVersion: 1;
  compounds: readonly PublicCompoundResearchEntry[];
}>;
