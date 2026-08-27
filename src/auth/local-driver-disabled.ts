import type { LocalTestDriver } from "./local-driver-types";

export function getLocalTestDriver(): LocalTestDriver {
  throw new Error("The local deterministic test driver is unavailable in this build");
}
