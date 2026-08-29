import type { AttributionProgram } from "@/growth/attribution-cookie";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";

const DEFAULT_ATTRIBUTION_LOOKUP_LIMIT = 120;
const ATTRIBUTION_LOOKUP_WINDOW_MS = 60_000;

type LandingLookupInput = Readonly<{ code: string; now: Date }>;

export function createRateLimitedAttributionLandingLookup<Result>(input: Readonly<{
  program: AttributionProgram;
  lookup: (input: LandingLookupInput) => Promise<Result | null>;
  rateLimitStore: RateLimitStore;
  secret: string;
  limit?: number;
}>): (input: LandingLookupInput) => Promise<Result | null> {
  return async (lookupInput) => {
    try {
      const decision = await consumeFixedWindowLimit({
        store: input.rateLimitStore,
        scope: createRateLimitScope(
          lookupInput.code,
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
