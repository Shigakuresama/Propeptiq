import { createHmac } from "node:crypto";

export type RateLimitStore = Readonly<{
  increment: (window: Readonly<{
    scopeHash: string;
    windowStart: Date;
    expiresAt: Date;
  }>) => Promise<number>;
}>;

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAt: string;
}>;

export function createRateLimitScope(
  actorId: string,
  operation: string,
  secret: string,
): string {
  if (!actorId.trim() || !operation.trim() || secret.length < 32) {
    throw new Error("Rate-limit scope input is invalid");
  }
  return createHmac("sha256", secret)
    .update(`${actorId}\u0000${operation}`)
    .digest("hex");
}

export async function consumeFixedWindowLimit(input: Readonly<{
  store: RateLimitStore;
  scope: string;
  limit: number;
  windowMs: number;
  now: Date;
}>): Promise<RateLimitDecision> {
  if (
    !/^[a-f0-9]{64}$/.test(input.scope) ||
    !Number.isSafeInteger(input.limit) ||
    input.limit <= 0 ||
    !Number.isSafeInteger(input.windowMs) ||
    input.windowMs <= 0 ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw new Error("Rate-limit request is invalid");
  }
  const timestamp = input.now.getTime();
  const windowStart = Math.floor(timestamp / input.windowMs) * input.windowMs;
  const expiresAt = new Date(windowStart + input.windowMs);
  const retryAt = expiresAt.toISOString();
  const count = await input.store.increment({
    scopeHash: input.scope,
    windowStart: new Date(windowStart),
    expiresAt,
  });
  return Object.freeze({
    allowed: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    retryAt,
  });
}
