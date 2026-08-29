import { isIP } from "node:net";

import type {
  AttributionEnvironment,
  AttributionProgram,
} from "@/growth/attribution-cookie";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";

const DEFAULT_ATTRIBUTION_LOOKUP_LIMIT = 120;
const ATTRIBUTION_LOOKUP_WINDOW_MS = 60_000;

export type AttributionLandingLookupInput = Readonly<{
  code: string;
  now: Date;
  callerAddress: string;
}>;

export function readAttributionCallerAddress(
  request: Request,
  environment: AttributionEnvironment,
): string | null {
  const rawAddress = environment === "local"
    ? request.headers.get("x-forwarded-for") ?? "127.0.0.1"
    : request.headers.get("x-vercel-forwarded-for");
  const callerAddress = rawAddress?.trim().toLowerCase();
  if (
    !callerAddress ||
    callerAddress.length > 64 ||
    callerAddress.includes(",") ||
    isIP(callerAddress) === 0
  ) {
    return null;
  }
  return callerAddress;
}

export function createRateLimitedAttributionLandingLookup<Result>(input: Readonly<{
  program: AttributionProgram;
  lookup: (input: AttributionLandingLookupInput) => Promise<Result | null>;
  rateLimitStore: RateLimitStore;
  secret: string;
  limit?: number;
}>): (input: AttributionLandingLookupInput) => Promise<Result | null> {
  return async (lookupInput) => {
    if (isIP(lookupInput.callerAddress) === 0) return null;
    try {
      const decision = await consumeFixedWindowLimit({
        store: input.rateLimitStore,
        scope: createRateLimitScope(
          lookupInput.callerAddress,
          `attribution.${input.program}.lookup`,
          input.secret,
        ),
        limit: input.limit ?? DEFAULT_ATTRIBUTION_LOOKUP_LIMIT,
        windowMs: ATTRIBUTION_LOOKUP_WINDOW_MS,
        now: lookupInput.now,
      });
      if (!decision.allowed) return null;
    } catch {
      return null;
    }
    return input.lookup(lookupInput);
  };
}
