import type { RateLimitStore } from "@/security/rate-limit";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
} from "@/security/rate-limit";

type BetterAuthRateLimitRule = Readonly<{
  window: number;
  max: number;
}>;

type BetterAuthRateLimitRecord = Readonly<{
  key: string;
  count: number;
  lastRequest: number;
}>;

export type BetterAuthRateLimitStorage = Readonly<{
  get: (key: string) => Promise<BetterAuthRateLimitRecord | null>;
  set: (
    key: string,
    value: BetterAuthRateLimitRecord,
    update?: boolean,
  ) => Promise<void>;
  consume: (
    key: string,
    rule: BetterAuthRateLimitRule,
  ) => Promise<Readonly<{ allowed: boolean; retryAfter: number | null }>>;
}>;

export function createBetterAuthRateLimitStorage(input: Readonly<{
  secret: string;
  store: RateLimitStore;
  now?: () => Date;
}>): BetterAuthRateLimitStorage {
  const now = input.now ?? (() => new Date());

  return Object.freeze({
    async get() {
      return null;
    },
    async set() {
      throw new Error("Better Auth rate limiting requires atomic consume");
    },
    async consume(key, rule) {
      if (
        !key ||
        !Number.isSafeInteger(rule.window) ||
        rule.window <= 0 ||
        !Number.isSafeInteger(rule.max) ||
        rule.max <= 0
      ) {
        throw new Error("Better Auth rate-limit rule is invalid");
      }

      const requestTime = now();
      const decision = await consumeFixedWindowLimit({
        store: input.store,
        scope: createRateLimitScope(
          key,
          "better-auth.request",
          input.secret,
        ),
        limit: rule.max,
        windowMs: rule.window * 1_000,
        now: requestTime,
      });

      if (decision.allowed) {
        return Object.freeze({ allowed: true, retryAfter: null });
      }

      const retryAfter = Math.max(
        1,
        Math.ceil(
          (new Date(decision.retryAt).getTime() - requestTime.getTime()) /
            1_000,
        ),
      );
      return Object.freeze({ allowed: false, retryAfter });
    },
  });
}
