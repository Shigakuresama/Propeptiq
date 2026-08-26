import "server-only";

import {
  hasProductionIdentity,
  type ServerEnv,
} from "@/config/env-schema";

declare const fulfillmentExecutionContext: unique symbol;

export type FulfillmentExecutionContextV1 = Readonly<{
  enabled: boolean;
  toJSON: () => never;
  [fulfillmentExecutionContext]: true;
}>;

const authorities = new WeakSet<object>();

function coherent(environment: ServerEnv): boolean {
  const production = hasProductionIdentity(environment);
  const localTest =
    environment.FULFILLMENT_MODE === "test" &&
    !production &&
    environment.APP_ENV === "local" &&
    environment.LOCAL_TEST_DRIVER === "enabled";
  const guardedTest =
    environment.FULFILLMENT_MODE === "test" &&
    !production &&
    environment.AUTH_MODE === "test" &&
    environment.DATABASE_MODE === "test" &&
    environment.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
  const live =
    environment.FULFILLMENT_MODE === "live" &&
    production &&
    environment.AUTH_MODE === "live" &&
    environment.DATABASE_MODE === "live";
  return localTest || guardedTest || live;
}

export function createFulfillmentExecutionContextV1(
  environment: ServerEnv,
): FulfillmentExecutionContextV1 {
  const value = Object.freeze({
    enabled: coherent(environment),
    toJSON(): never {
      throw new Error("Fulfillment execution context must not be serialized");
    },
  });
  authorities.add(value);
  return value as FulfillmentExecutionContextV1;
}

export function projectFulfillmentExecutionContextV1(
  value: unknown,
): Readonly<{ enabled: boolean }> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !authorities.has(value)
  ) {
    return null;
  }
  const context = value as FulfillmentExecutionContextV1;
  return Object.freeze({ enabled: context.enabled === true });
}
