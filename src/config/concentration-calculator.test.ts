import { describe, expect, it } from "vitest";

import type { ControlledContentRecord } from "@/content/storefront-content";

import {
  concentrationCalculatorConfiguration,
  resolvePublicConcentrationCalculatorConfiguration,
  type ControlledConcentrationCalculatorConfiguration,
} from "./concentration-calculator";

const approvedConfiguration: ControlledConcentrationCalculatorConfiguration = {
  status: "approved",
  maxVialMg: 100,
  maxDiluentMl: 50,
  maxSampleMl: 10,
  placementApproved: true,
  approvalNote: "Synthetic Task 5 placement approval",
  reviewedAt: "2026-08-31T12:00:00.000Z",
  publicationPolicy: { version: "synthetic-task-5", activeLotEvidenceIds: [] },
  contentId: "calculator-copy-synthetic",
};

const approvedCopy: ControlledContentRecord = {
  id: "calculator-copy-synthetic",
  kind: "calculator_copy",
  status: "approved",
  title: "Laboratory concentration calculator",
  body: "Calculate bounded concentration values.",
  sourceReferences: ["private-source-reference"],
  approvalNote: "private copy approval",
  reviewedAt: "2026-08-31T12:30:00.000Z",
  effectiveAt: null,
};

function resolve(overrides: Partial<Parameters<typeof resolvePublicConcentrationCalculatorConfiguration>[0]> = {}) {
  return resolvePublicConcentrationCalculatorConfiguration({
    mode: "approved",
    productionIdentity: false,
    configuration: approvedConfiguration,
    content: [approvedCopy],
    ...overrides,
  });
}

describe("concentration calculator controlled projection", () => {
  it("keeps production configuration empty and disabled by default", () => {
    expect(concentrationCalculatorConfiguration).toBeNull();
    expect(resolve({ mode: "disabled" })).toBeNull();
  });

  it("returns only a frozen safe DTO for a synthetic approved fixture", () => {
    const projection = resolve();
    expect(projection).toEqual({
      title: "Laboratory concentration calculator",
      body: "Calculate bounded concentration values.",
      limits: { maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 10 },
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection?.limits)).toBe(true);
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toMatch(/contentId|approval|reviewed|source|policy|mode|status/iu);
  });

  it("allows exact-title neutral arithmetic-only copy", () => {
    expect(
      resolve({
        content: [{
          ...approvedCopy,
          title: "Laboratory concentration calculator",
          body: "Perform bounded arithmetic conversions only.",
        }],
      }),
    ).toMatchObject({
      title: "Laboratory concentration calculator",
      body: "Perform bounded arithmetic conversions only.",
    });
  });

  it("rejects any title other than the exact neutral calculator title", () => {
    expect(
      resolve({
        content: [{ ...approvedCopy, title: "Peptide concentration helper" }],
      }),
    ).toBeNull();
  });

  it.each([
    ["draw-volume recommendation", "Draw 0.1 mL from the vial."],
    ["syringe units", "Use 10 syringe units."],
    ["every-day schedule", "Repeat every day."],
    ["daily frequency", "Calculate daily."],
    ["explicit frequency", "Choose a frequency."],
    ["schedule", "Follow this schedule."],
    ["protocol", "Follow this protocol."],
    ["injection technique", "Use this injection technique."],
    ["administration guidance", "Administration instructions follow."],
    ["treatment guidance", "Treatment guidance follows."],
    ["human dosage advice", "Human dosage advice follows."],
  ] as const)("rejects calculator copy containing %s", (_label, body) => {
    expect(resolve({ content: [{ ...approvedCopy, body }] })).toBeNull();
  });

  it("permits preview only outside a production identity", () => {
    expect(resolve({ mode: "preview" })).not.toBeNull();
    expect(resolve({ mode: "preview", productionIdentity: true })).toBeNull();
  });

  it.each([
    ["draft configuration", { configuration: { ...approvedConfiguration, status: "draft" } }],
    ["retired configuration", { configuration: { ...approvedConfiguration, status: "retired" } }],
    ["missing configuration", { configuration: null }],
    ["placement denied", { configuration: { ...approvedConfiguration, placementApproved: false } }],
    ["blank approval note", { configuration: { ...approvedConfiguration, approvalNote: "  " } }],
    ["invalid limit", { configuration: { ...approvedConfiguration, maxSampleMl: 0 } }],
    ["non-finite limit", { configuration: { ...approvedConfiguration, maxDiluentMl: Infinity } }],
    ["noncanonical configuration timestamp", { configuration: { ...approvedConfiguration, reviewedAt: "2026-08-31" } }],
    ["invalid publication policy", { configuration: { ...approvedConfiguration, publicationPolicy: { version: "", activeLotEvidenceIds: [] } } }],
    ["missing copy", { content: [] }],
    ["draft copy", { content: [{ ...approvedCopy, status: "draft" }] }],
    ["retired copy", { content: [{ ...approvedCopy, status: "retired" }] }],
    ["wrong copy kind", { content: [{ ...approvedCopy, kind: "faq" }] }],
    ["blank title", { content: [{ ...approvedCopy, title: " " }] }],
    ["blank body", { content: [{ ...approvedCopy, body: " " }] }],
    ["noncanonical copy timestamp", { content: [{ ...approvedCopy, reviewedAt: "2026-08-31T12:30:00Z" }] }],
    ["blocked copy", { content: [{ ...approvedCopy, body: "Reconstitution guidance" }] }],
  ] as const)("fails closed for %s", (_label, overrides) => {
    expect(resolve(overrides as never)).toBeNull();
  });

  it("rejects duplicate IDs across all statuses and kinds before filtering", () => {
    expect(
      resolve({
        content: [approvedCopy, { ...approvedCopy, kind: "faq", status: "retired" }],
      }),
    ).toBeNull();
  });

  it("does not mutate controlled configuration or complete content inputs", () => {
    const configuration = { ...approvedConfiguration };
    const content = [{ ...approvedCopy }];
    const beforeConfiguration = structuredClone(configuration);
    const beforeContent = structuredClone(content);

    expect(resolve({ configuration, content })).not.toBeNull();
    expect(configuration).toEqual(beforeConfiguration);
    expect(content).toEqual(beforeContent);
  });
});
