const strictInstant = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/u;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isStrictStorefrontPromotionInstant(value: unknown): value is string {
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
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth(year, month) &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    second >= 0 && second <= 59 &&
    offsetHour >= 0 && offsetHour <= 23 &&
    offsetMinute >= 0 && offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

export function storefrontPromotionInstantEpochNanoseconds(value: unknown): bigint | null {
  if (!isStrictStorefrontPromotionInstant(value)) return null;
  const match = strictInstant.exec(value);
  if (match === null) return null;
  const fraction = (match[7] ?? "").padEnd(9, "0");
  const millisecondsWithinSecond = BigInt(fraction.slice(0, 3));
  const epochMilliseconds = BigInt(Date.parse(value));
  return (epochMilliseconds - millisecondsWithinSecond) * NANOSECONDS_PER_MILLISECOND + BigInt(fraction);
}

export function storefrontPromotionDateEpochNanoseconds(value: unknown): bigint | null {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  return BigInt(value.getTime()) * NANOSECONDS_PER_MILLISECOND;
}
