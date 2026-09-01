import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { hasProductionIdentity, type ServerEnv } from "@/config/env-schema";
import {
  concentrationCalculatorConfiguration,
  resolvePublicConcentrationCalculatorConfiguration,
  type ControlledConcentrationCalculatorConfiguration,
} from "@/config/concentration-calculator";
import {
  storefrontContentRecords,
  type ControlledContentRecord,
} from "@/content/storefront-content";
import type { PublicConcentrationCalculatorConfiguration } from "@/domain/concentration";
import { readServerEnv } from "@/env";

export type ConcentrationCalculatorServerDependencies = Readonly<{
  configuration?: ControlledConcentrationCalculatorConfiguration | null;
  content?: readonly ControlledContentRecord[];
}>;

export async function loadPublicConcentrationCalculatorConfiguration(
  environment: ServerEnv,
  dependencies: ConcentrationCalculatorServerDependencies = {},
): Promise<PublicConcentrationCalculatorConfiguration | null> {
  return resolvePublicConcentrationCalculatorConfiguration({
    mode: environment.RECONSTITUTION_CALCULATOR_MODE,
    productionIdentity: hasProductionIdentity(environment),
    configuration:
      dependencies.configuration ?? concentrationCalculatorConfiguration,
    content: dependencies.content ?? storefrontContentRecords,
  });
}

type ConcentrationCalculatorProjection =
  PublicConcentrationCalculatorConfiguration | null;

export type ConcentrationCalculatorRequestAccessorDependencies = Readonly<{
  connect?: () => Promise<unknown>;
  readEnvironment?: () => ServerEnv;
  loadProjection?: (
    environment: ServerEnv,
  ) => Promise<ConcentrationCalculatorProjection>;
  cacheProjection?: (
    acquire: () => Promise<ConcentrationCalculatorProjection>,
  ) => () => Promise<ConcentrationCalculatorProjection>;
}>;

export function createConcentrationCalculatorRequestAccessor(
  dependencies: ConcentrationCalculatorRequestAccessorDependencies = {},
): () => Promise<ConcentrationCalculatorProjection> {
  const acquire = async (): Promise<ConcentrationCalculatorProjection> => {
    await (dependencies.connect ?? connection)();
    const environment = (dependencies.readEnvironment ?? readServerEnv)();
    return (
      dependencies.loadProjection ??
      loadPublicConcentrationCalculatorConfiguration
    )(environment);
  };
  return (dependencies.cacheProjection ?? ((currentAcquire) =>
    cache(currentAcquire)))(acquire);
}

export const getPublicConcentrationCalculatorConfiguration =
  createConcentrationCalculatorRequestAccessor();
