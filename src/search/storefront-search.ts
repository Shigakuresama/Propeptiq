export type SearchEntry = Readonly<{
  id: string;
  group: "products" | "information";
  title: string;
  href: string;
  description: string;
  exactTerms: readonly string[];
  keywords: readonly string[];
  popularityRank: number | null;
}>;

export type SearchResult = Readonly<{
  entry: SearchEntry;
  score: number;
}>;

export type CatalogSort =
  | "popular"
  | "price-asc"
  | "price-desc"
  | "alphabetical"
  | "newest";

export type ProductPriceSortState =
  | Readonly<{ state: "active"; effectiveMinor: number }>
  | Readonly<{ state: "pending" }>
  | Readonly<{ state: "unavailable" }>;

export type StorefrontProductSortRow = Readonly<{
  id: string;
  name: string;
  popularityRank: number | null;
  releasedAt: string | null;
  price: ProductPriceSortState;
}>;

const ENGLISH_SORT_OPTIONS = {
  sensitivity: "base",
  numeric: false,
  usage: "sort",
} as const;

const MAX_FUZZY_QUERY_CODE_UNITS = 128;
const MAX_FUZZY_QUERY_TOKENS = 8;
const MAX_FUZZY_TOKEN_CODE_UNITS = 64;
const MAX_FUZZY_CORPUS_TOKENS = 64;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compareText(left: string, right: string): number {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);
  const englishOrder = normalizedLeft.localeCompare(
    normalizedRight,
    "en",
    ENGLISH_SORT_OPTIONS,
  );
  if (englishOrder !== 0 || normalizedLeft === normalizedRight) {
    return englishOrder;
  }
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function compareStableIds(left: string, right: string): number {
  const englishOrder = compareText(left, right);
  if (englishOrder !== 0 || left === right) {
    return englishOrder;
  }
  return left < right ? -1 : 1;
}

function validateUniqueIds<T extends Readonly<{ id: string }>>(
  values: readonly T[],
  collectionName: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value.id !== "string" || value.id.trim().length === 0) {
      throw new TypeError(`${collectionName} IDs must be nonblank strings.`);
    }
    if (seen.has(value.id)) {
      throw new TypeError(`${collectionName} IDs must be unique.`);
    }
    seen.add(value.id);
  }
}

function tokens(value: string): readonly string[] {
  return value.length === 0 ? [] : value.split(" ");
}

function boundedLevenshtein(
  left: string,
  right: string,
  maximumDistance: number,
): number {
  if (Math.abs(left.length - right.length) > maximumDistance) {
    return maximumDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array<number>(right.length + 1).fill(maximumDistance + 1);
    current[0] = leftIndex;
    const firstColumn = Math.max(1, leftIndex - maximumDistance);
    const lastColumn = Math.min(right.length, leftIndex + maximumDistance);
    let rowMinimum = current[0];

    for (let rightIndex = firstColumn; rightIndex <= lastColumn; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + substitutionCost,
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]!);
    }

    if (rowMinimum > maximumDistance) {
      return maximumDistance + 1;
    }
    previous = current;
  }

  return previous[right.length] ?? maximumDistance + 1;
}

function fuzzyScore(
  coreTokens: readonly string[],
  metadataTokens: readonly string[],
  query: string,
  queryTokens: readonly string[],
): number | null {
  if (
    query.length > MAX_FUZZY_QUERY_CODE_UNITS ||
    queryTokens.length > MAX_FUZZY_QUERY_TOKENS ||
    queryTokens.some(
      (token) => token.length < 4 || token.length > MAX_FUZZY_TOKEN_CODE_UNITS,
    )
  ) {
    return null;
  }

  const corpus = [...new Set([...coreTokens, ...metadataTokens])]
    .filter(
      (token) => token.length >= 4 && token.length <= MAX_FUZZY_TOKEN_CODE_UNITS,
    )
    .sort(compareText)
    .slice(0, MAX_FUZZY_CORPUS_TOKENS);
  let totalDistance = 0;

  for (const queryToken of queryTokens) {
    const maximumDistance = queryToken.length >= 8 ? 2 : 1;
    let bestDistance = maximumDistance + 1;
    for (const candidate of corpus) {
      if (Math.abs(queryToken.length - candidate.length) > maximumDistance) {
        continue;
      }
      bestDistance = Math.min(
        bestDistance,
        boundedLevenshtein(queryToken, candidate, maximumDistance),
      );
      if (bestDistance === 0) {
        break;
      }
    }
    if (bestDistance > maximumDistance) {
      return null;
    }
    totalDistance += bestDistance;
  }

  return 100 - totalDistance;
}

function scoreEntry(entry: SearchEntry, query: string): number | null {
  const queryTokens = tokens(query);
  const coreFields = [entry.title, ...entry.exactTerms]
    .map(normalizeSearchText)
    .filter((value) => value.length > 0);
  const coreTokens = coreFields.flatMap(tokens);
  const metadataFields = [...entry.keywords, entry.description]
    .map(normalizeSearchText)
    .filter((value) => value.length > 0);
  const metadataTokens = metadataFields.flatMap(tokens);

  if (coreFields.some((field) => field === query)) {
    return 600;
  }
  if (
    coreFields.some((field) => field.startsWith(query)) ||
    (queryTokens.length === 1 &&
      coreTokens.some((token) => token.startsWith(queryTokens[0]!)))
  ) {
    return 500;
  }
  if (queryTokens.every((token) => coreTokens.includes(token))) {
    return 400;
  }
  if (coreFields.some((field) => field.includes(query))) {
    return 300;
  }
  if (
    metadataFields.some((field) => field.includes(query)) ||
    queryTokens.every((token) => metadataTokens.includes(token))
  ) {
    return 200;
  }
  return fuzzyScore(coreTokens, metadataTokens, query, queryTokens);
}

function rankedPopularity(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

export function searchEntries(
  entries: readonly SearchEntry[],
  query: string,
): readonly SearchResult[] {
  validateUniqueIds(entries, "Search entry");
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return Object.freeze([]);
  }

  const results = entries.flatMap((entry) => {
    const score = scoreEntry(entry, normalizedQuery);
    return score === null ? [] : [Object.freeze({ entry, score })];
  });

  results.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    const leftPopularity = rankedPopularity(left.entry.popularityRank);
    const rightPopularity = rankedPopularity(right.entry.popularityRank);
    if (leftPopularity !== null || rightPopularity !== null) {
      if (leftPopularity === null) return 1;
      if (rightPopularity === null) return -1;
      if (leftPopularity !== rightPopularity) return leftPopularity - rightPopularity;
    }
    const titleOrder = compareText(left.entry.title, right.entry.title);
    return titleOrder !== 0
      ? titleOrder
      : compareStableIds(left.entry.id, right.entry.id);
  });

  return Object.freeze(results);
}

function rankedProductPopularity(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

type PriceSortValue = Readonly<{ bucket: 0 | 1 | 2; amount: number }>;

function priceSortValue(price: ProductPriceSortState): PriceSortValue {
  if (price.state === "pending") {
    return { bucket: 1, amount: 0 };
  }
  if (
    price.state === "active" &&
    Number.isSafeInteger(price.effectiveMinor) &&
    price.effectiveMinor >= 0
  ) {
    return { bucket: 0, amount: price.effectiveMinor };
  }
  return { bucket: 2, amount: 0 };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

function strictInstant(value: string | null): bigint | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const localMilliseconds = date.getTime();
  if (!Number.isFinite(localMilliseconds)) return null;

  const offsetSign = match[9] === "-" ? -1 : 1;
  const offsetMilliseconds =
    offsetSign * (offsetHour * 60 + offsetMinute) * 60 * 1_000;
  const utcMilliseconds = localMilliseconds - offsetMilliseconds;
  if (!Number.isFinite(utcMilliseconds)) return null;

  const fractionalNanoseconds = BigInt(fraction.padEnd(9, "0") || "0");
  return BigInt(utcMilliseconds) * 1_000_000n + fractionalNanoseconds;
}

function compareNameAndId(
  left: StorefrontProductSortRow,
  right: StorefrontProductSortRow,
): number {
  const nameOrder = compareText(left.name, right.name);
  return nameOrder !== 0 ? nameOrder : compareStableIds(left.id, right.id);
}

export function sortStorefrontProducts(
  rows: readonly StorefrontProductSortRow[],
  mode: CatalogSort,
): readonly StorefrontProductSortRow[] {
  validateUniqueIds(rows, "Storefront product");
  const sorted = [...rows];

  sorted.sort((left, right) => {
    if (mode === "popular") {
      const leftRank = rankedProductPopularity(left.popularityRank);
      const rightRank = rankedProductPopularity(right.popularityRank);
      if (leftRank !== null || rightRank !== null) {
        if (leftRank === null) return 1;
        if (rightRank === null) return -1;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      return compareNameAndId(left, right);
    }

    if (mode === "price-asc" || mode === "price-desc") {
      const leftPrice = priceSortValue(left.price);
      const rightPrice = priceSortValue(right.price);
      if (leftPrice.bucket !== rightPrice.bucket) {
        return leftPrice.bucket - rightPrice.bucket;
      }
      if (leftPrice.bucket === 0 && leftPrice.amount !== rightPrice.amount) {
        return mode === "price-asc"
          ? leftPrice.amount - rightPrice.amount
          : rightPrice.amount - leftPrice.amount;
      }
      return compareNameAndId(left, right);
    }

    if (mode === "newest") {
      const leftInstant = strictInstant(left.releasedAt);
      const rightInstant = strictInstant(right.releasedAt);
      if (leftInstant !== null || rightInstant !== null) {
        if (leftInstant === null) return 1;
        if (rightInstant === null) return -1;
        if (leftInstant !== rightInstant) return leftInstant > rightInstant ? -1 : 1;
      }
    }

    return compareNameAndId(left, right);
  });

  return Object.freeze(sorted);
}
