export type StorefrontPromotionConfigurationScope = Readonly<
  | { kind: "sitewide" }
  | { kind: "products"; productIds: readonly string[] }
  | { kind: "variants"; variantIds: readonly string[] }
>;

export type StorefrontPromotionConfiguration = Readonly<{
  id: string;
  displayName: string;
  displayCode: string | null;
  discountBps: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  applicationMode: "automatic" | "code_required";
  scope: StorefrontPromotionConfigurationScope;
}>;

const winter30Scope = Object.freeze({ kind: "sitewide" } as const);

export const WINTER30_STOREFRONT_PROMOTION = Object.freeze({
  id: "winter30",
  displayName: "Winter Sale",
  displayCode: "WINTER30",
  discountBps: 3_000,
  enabled: true,
  startAt: null,
  endAt: null,
  timezone: "America/Los_Angeles",
  applicationMode: "automatic",
  scope: winter30Scope,
} as const satisfies StorefrontPromotionConfiguration);

export const STOREFRONT_PROMOTIONS: readonly StorefrontPromotionConfiguration[] =
  Object.freeze([WINTER30_STOREFRONT_PROMOTION]);

const campaignKey = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/u;
const strictInstant = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/u;
const configurationKeys = Object.freeze([
  "id",
  "displayName",
  "displayCode",
  "discountBps",
  "enabled",
  "startAt",
  "endAt",
  "timezone",
  "applicationMode",
  "scope",
] as const);
const MAX_CONFIGURED_PROMOTIONS = 100;
const MAX_SCOPE_TARGETS = 1_000;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isStrictStorefrontPromotionInstant(
  value: unknown,
): value is string {
  if (typeof value !== "string") return false;
  const match = strictInstant.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    offsetHour >= 0 &&
    offsetHour <= 23 &&
    offsetMinute >= 0 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

export function isValidStorefrontPromotionTimezone(
  value: unknown,
): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type OwnData = Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false }>;

function ownData(value: object, key: string): OwnData {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? { ok: true, value: descriptor.value }
    : { ok: false };
}

function exactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | null {
  if (!isRuntimeObject(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const field = ownData(value, key);
    if (!field.ok) return null;
    result[key] = field.value;
  }
  return result;
}

function denseArraySnapshot(
  value: unknown,
  maximumLength: number,
): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumLength
  ) {
    return null;
  }
  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== length + 1 ||
    ownKeys.some((key) =>
      key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length)
    )
  ) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) return null;
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTargets(value: unknown): readonly string[] | null {
  const targets = denseArraySnapshot(value, MAX_SCOPE_TARGETS);
  if (targets === null || targets.length === 0 || !targets.every(nonblank)) {
    return null;
  }
  const unique = new Set(targets);
  if (unique.size !== targets.length) return null;
  return Object.freeze(
    [...(targets as readonly string[])].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
  );
}

function normalizeScope(
  value: unknown,
): StorefrontPromotionConfigurationScope | null {
  if (!isRuntimeObject(value)) return null;
  const kind = ownData(value, "kind");
  if (!kind.ok) return null;
  if (kind.value === "sitewide") {
    return exactDataObject(value, ["kind"]) === null
      ? null
      : Object.freeze({ kind: "sitewide" });
  }
  if (kind.value === "products") {
    const scope = exactDataObject(value, ["kind", "productIds"]);
    if (scope === null) return null;
    const productIds = normalizeTargets(scope.productIds);
    return productIds === null
      ? null
      : Object.freeze({ kind: "products", productIds });
  }
  if (kind.value === "variants") {
    const scope = exactDataObject(value, ["kind", "variantIds"]);
    if (scope === null) return null;
    const variantIds = normalizeTargets(scope.variantIds);
    return variantIds === null
      ? null
      : Object.freeze({ kind: "variants", variantIds });
  }
  return null;
}

function normalizeConfiguration(
  value: unknown,
): StorefrontPromotionConfiguration | null {
  const entry = exactDataObject(value, configurationKeys);
  if (entry === null) return null;
  const scope = normalizeScope(entry.scope);
  if (
    typeof entry.id !== "string" ||
    entry.id.length > 64 ||
    !campaignKey.test(entry.id) ||
    !nonblank(entry.displayName) ||
    (entry.displayCode !== null && !nonblank(entry.displayCode)) ||
    typeof entry.discountBps !== "number" ||
    !Number.isSafeInteger(entry.discountBps) ||
    entry.discountBps < 1 ||
    entry.discountBps > 10_000 ||
    typeof entry.enabled !== "boolean" ||
    (entry.startAt !== null && !isStrictStorefrontPromotionInstant(entry.startAt)) ||
    (entry.endAt !== null && !isStrictStorefrontPromotionInstant(entry.endAt)) ||
    !isValidStorefrontPromotionTimezone(entry.timezone) ||
    (entry.applicationMode !== "automatic" && entry.applicationMode !== "code_required") ||
    scope === null
  ) {
    return null;
  }
  if (entry.startAt !== null && entry.endAt !== null) {
    const startInstant = strictInstantEpochNanoseconds(entry.startAt);
    const endInstant = strictInstantEpochNanoseconds(entry.endAt);
    if (
      startInstant === null ||
      endInstant === null ||
      endInstant <= startInstant
    ) {
      return null;
    }
  }
  return Object.freeze({
    id: entry.id,
    displayName: entry.displayName,
    displayCode: entry.displayCode,
    discountBps: entry.discountBps,
    enabled: entry.enabled,
    startAt: entry.startAt,
    endAt: entry.endAt,
    timezone: entry.timezone,
    applicationMode: entry.applicationMode,
    scope,
  }) as StorefrontPromotionConfiguration;
}

export function resolveActiveConfiguredAutomaticPromotions(
  configurations: unknown,
  now: Date,
): readonly StorefrontPromotionConfiguration[] | null {
  try {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
    const entries = denseArraySnapshot(configurations, MAX_CONFIGURED_PROMOTIONS);
    if (entries === null) return null;
    const normalized: StorefrontPromotionConfiguration[] = [];
    const ids = new Set<string>();
    for (const entry of entries) {
      const promotion = normalizeConfiguration(entry);
      if (promotion === null || ids.has(promotion.id)) return null;
      ids.add(promotion.id);
      normalized.push(promotion);
    }
    const nowInstant = BigInt(now.getTime()) * NANOSECONDS_PER_MILLISECOND;
    const active = normalized
      .filter((promotion) => {
        if (!promotion.enabled || promotion.applicationMode !== "automatic") {
          return false;
        }
        if (promotion.startAt !== null) {
          const startInstant = strictInstantEpochNanoseconds(promotion.startAt);
          if (startInstant === null || nowInstant < startInstant) return false;
        }
        if (promotion.endAt !== null) {
          const endInstant = strictInstantEpochNanoseconds(promotion.endAt);
          if (endInstant === null || nowInstant >= endInstant) return false;
        }
        return true;
      })
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
    return Object.freeze(active);
  } catch {
    return null;
  }
}

function scopesMatch(
  candidate: unknown,
  configured: StorefrontPromotionConfigurationScope,
): boolean {
  const normalized = normalizeScope(candidate);
  if (normalized === null || normalized.kind !== configured.kind) return false;
  if (normalized.kind === "sitewide" && configured.kind === "sitewide") return true;
  if (normalized.kind === "products" && configured.kind === "products") {
    return normalized.productIds.length === configured.productIds.length &&
      normalized.productIds.every((id, index) => id === configured.productIds[index]);
  }
  if (normalized.kind === "variants" && configured.kind === "variants") {
    return normalized.variantIds.length === configured.variantIds.length &&
      normalized.variantIds.every((id, index) => id === configured.variantIds[index]);
  }
  return false;
}

function strictInstantEpochNanoseconds(value: unknown): bigint | null {
  if (!isStrictStorefrontPromotionInstant(value)) return null;
  const match = strictInstant.exec(value);
  if (match === null) return null;
  const fraction = (match[7] ?? "").padEnd(9, "0");
  const millisecondsWithinSecond = BigInt(fraction.slice(0, 3));
  const epochMilliseconds = BigInt(Date.parse(value));
  return (
    (epochMilliseconds - millisecondsWithinSecond) *
      NANOSECONDS_PER_MILLISECOND +
    BigInt(fraction)
  );
}

function instantsMatch(candidate: unknown, configured: string | null): boolean {
  if (candidate === null || configured === null) return candidate === configured;
  const candidateInstant = strictInstantEpochNanoseconds(candidate);
  const configuredInstant = strictInstantEpochNanoseconds(configured);
  return (
    candidateInstant !== null &&
    configuredInstant !== null &&
    candidateInstant === configuredInstant
  );
}

export function storefrontPromotionMatchesConfiguration(
  promotion: unknown,
  configuration: StorefrontPromotionConfiguration,
): boolean {
  try {
    const configured = normalizeConfiguration(configuration);
    if (configured === null || !isRuntimeObject(promotion)) return false;
    const id = ownData(promotion, "id");
    if (!id.ok || id.value !== configured.id) return false;
    const displayName = ownData(promotion, "displayName");
    const displayCode = ownData(promotion, "displayCode");
    const discountBps = ownData(promotion, "discountBps");
    const enabled = ownData(promotion, "enabled");
    const startAt = ownData(promotion, "startAt");
    const endAt = ownData(promotion, "endAt");
    const timezone = ownData(promotion, "timezone");
    const applicationMode = ownData(promotion, "applicationMode");
    const scope = ownData(promotion, "scope");
    if (
      !displayName.ok ||
      !displayCode.ok ||
      !discountBps.ok ||
      !enabled.ok ||
      !startAt.ok ||
      !endAt.ok ||
      !timezone.ok ||
      !applicationMode.ok ||
      !scope.ok
    ) {
      return false;
    }
    return (
      displayName.value === configured.displayName &&
      displayCode.value === configured.displayCode &&
      discountBps.value === configured.discountBps &&
      enabled.value === configured.enabled &&
      instantsMatch(startAt.value, configured.startAt) &&
      instantsMatch(endAt.value, configured.endAt) &&
      timezone.value === configured.timezone &&
      applicationMode.value === configured.applicationMode &&
      scopesMatch(scope.value, configured.scope)
    );
  } catch {
    return false;
  }
}

export function storefrontPromotionMatchesOwnerConfiguration(
  promotion: unknown,
): boolean {
  try {
    if (!isRuntimeObject(promotion)) return false;
    const id = ownData(promotion, "id");
    if (!id.ok || typeof id.value !== "string") return false;
    const configured = STOREFRONT_PROMOTIONS.find((entry) => entry.id === id.value);
    return configured === undefined
      ? true
      : storefrontPromotionMatchesConfiguration(promotion, configured);
  } catch {
    return false;
  }
}
