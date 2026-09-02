import { afterEach, describe, expect, it, vi } from "vitest";

const concentrationCalculatorModuleState = vi.hoisted(() => ({
  productionConfiguration: null as unknown,
}));

vi.mock("./concentration-calculator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./concentration-calculator")>();
  return {
    ...actual,
    get concentrationCalculatorConfiguration() {
      return concentrationCalculatorModuleState.productionConfiguration;
    },
  };
});

import { parseServerEnv } from "@/config/env-schema";
import type { ControlledContentRecord } from "@/content/storefront-content";

import type { ControlledConcentrationCalculatorConfiguration } from "./concentration-calculator";
import {
  createConcentrationCalculatorRequestAccessor,
  loadPublicConcentrationCalculatorConfiguration,
} from "./concentration-calculator-server";

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

describe("concentration calculator server boundary", () => {
  afterEach(() => {
    concentrationCalculatorModuleState.productionConfiguration = null;
  });

  it("shares one request-cached acquisition", async () => {
    const environment = parseServerEnv({ RECONSTITUTION_CALCULATOR_MODE: "approved" });
    const projection = Object.freeze({
      title: "Synthetic approved calculator",
      body: "Synthetic approved body.",
      limits: Object.freeze({ maxVialMg: 1, maxDiluentMl: 2, maxSampleMl: 3 }),
    });
    const connect = vi.fn(async () => undefined);
    const readEnvironment = vi.fn(() => environment);
    const loadProjection = vi.fn(async () => projection);
    const cacheProjection = <T,>(acquire: () => Promise<T>) => {
      let result: Promise<T> | undefined;
      return () => result ??= acquire();
    };
    const getProjection = createConcentrationCalculatorRequestAccessor({
      connect,
      readEnvironment,
      loadProjection,
      cacheProjection,
    });

    expect(await getProjection()).toBe(projection);
    expect(await getProjection()).toBe(projection);
    expect(connect).toHaveBeenCalledOnce();
    expect(readEnvironment).toHaveBeenCalledOnce();
    expect(loadProjection).toHaveBeenCalledOnce();
    expect(loadProjection).toHaveBeenCalledWith(environment);
  });

  it("returns null for the disabled default and approved mode with missing production configuration", async () => {
    await expect(
      loadPublicConcentrationCalculatorConfiguration(parseServerEnv({})),
    ).resolves.toBeNull();
    await expect(
      loadPublicConcentrationCalculatorConfiguration(
        parseServerEnv({ RECONSTITUTION_CALCULATOR_MODE: "approved" }),
      ),
    ).resolves.toBeNull();
  });

  it("rejects production preview through the shared environment boundary", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        VERCEL_ENV: "production",
        APP_ORIGIN: "https://production.propeptiq.example.invalid",
        RECONSTITUTION_CALCULATOR_MODE: "preview",
      }),
    ).toThrow(/RECONSTITUTION_CALCULATOR_MODE=preview/);
  });

  it("projects only the safe public DTO from a synthetic injected approved fixture", async () => {
    const projection = await loadPublicConcentrationCalculatorConfiguration(
      parseServerEnv({ RECONSTITUTION_CALCULATOR_MODE: "approved" }),
      { configuration: approvedConfiguration, content: [approvedCopy] },
    );

    expect(projection).toEqual({
      title: "Laboratory concentration calculator",
      body: "Calculate bounded concentration values.",
      limits: { maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 10 },
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /contentId|approval|reviewed|source|policy|mode|status/iu,
    );
  });

  it("keeps an explicit null override fail-closed when the production default is non-null", async () => {
    concentrationCalculatorModuleState.productionConfiguration = approvedConfiguration;
    const environment = parseServerEnv({
      RECONSTITUTION_CALCULATOR_MODE: "approved",
    });

    await expect(
      loadPublicConcentrationCalculatorConfiguration(environment, {
        content: [approvedCopy],
      }),
    ).resolves.toMatchObject({ title: "Laboratory concentration calculator" });
    await expect(
      loadPublicConcentrationCalculatorConfiguration(environment, {
        configuration: null,
        content: [approvedCopy],
      }),
    ).resolves.toBeNull();
  });
});
