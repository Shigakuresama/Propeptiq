import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import type { ApprovedPublicInformation } from "@/content/public-information";

import type { SearchEntry } from "./storefront-search";

export type StorefrontSearchIndex = Readonly<{
  version: 1;
  entries: readonly SearchEntry[];
}>;

export type StorefrontSearchIndexInput = Readonly<{
  products: readonly PublicStorefrontProduct[];
  information: readonly ApprovedPublicInformation[];
}>;

const PRODUCT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INVALID_INPUT_MESSAGE = "Invalid storefront search index input.";

function invalidInput(): never {
  throw new TypeError(INVALID_INPUT_MESSAGE);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidInput();
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : invalidInput();
}

function nonblankTrimmedString(value: unknown): string {
  const text = stringValue(value);
  return text.length > 0 && text.trim() === text ? text : invalidInput();
}

const MAX_ARRAY_INDEX = 2 ** 32 - 2;

function ownArrayIndex(key: PropertyKey): number | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const index = Number(key);
  return Number.isSafeInteger(index) &&
      index >= 0 &&
      index <= MAX_ARRAY_INDEX &&
      String(index) === key
    ? index
    : null;
}

function denseArraySnapshot(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return invalidInput();
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) {
    return invalidInput();
  }
  const length = lengthDescriptor.value as unknown;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    return invalidInput();
  }

  const arrayLength = length as number;
  const ownKeys = Reflect.ownKeys(value);
  let ownIndexCount = 0;
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const index = ownArrayIndex(ownKeys[keyIndex]!);
    if (index === null) continue;
    if (index >= arrayLength) return invalidInput();
    ownIndexCount += 1;
  }
  if (ownIndexCount !== arrayLength) return invalidInput();

  const snapshot = new Array<unknown>(arrayLength);
  for (let index = 0; index < arrayLength; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) return invalidInput();
    if ("value" in descriptor) {
      snapshot[index] = descriptor.value;
      continue;
    }
    snapshot[index] = descriptor.get === undefined
      ? undefined
      : Reflect.apply(descriptor.get, value, []);
  }
  return Object.freeze(snapshot);
}

function arrayValue(value: unknown): readonly unknown[] {
  return denseArraySnapshot(value);
}

function uniqueNonblankStrings(values: readonly string[]): readonly string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value.trim().length === 0 || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return Object.freeze(unique);
}

function stringArray(value: unknown): readonly string[] {
  return arrayValue(value).map((candidate) => stringValue(candidate));
}

type ProjectedDisplayConfiguration = Readonly<{
  displayCode: string;
  packageForm: string;
  sourceName: string | undefined;
}>;

function displayConfigurations(value: unknown): readonly ProjectedDisplayConfiguration[] {
  return arrayValue(value).map((candidate) => {
    const configuration = record(candidate);
    const sourceName = configuration.sourceName;
    return {
      displayCode: stringValue(configuration.displayCode),
      packageForm: stringValue(configuration.packageForm),
      sourceName:
        sourceName === undefined ? undefined : stringValue(sourceName),
    };
  });
}

function productEntry(candidate: unknown): SearchEntry {
  const product = record(candidate);
  const kind = product.kind;
  if (kind !== "canonical" && kind !== "browse_only") invalidInput();

  const slug = stringValue(product.slug);
  if (!PRODUCT_SLUG.test(slug)) invalidInput();
  const title = nonblankTrimmedString(product.name);
  const category = stringValue(product.category);
  const sourceName = stringValue(product.sourceName);
  const displays = displayConfigurations(product.displayConfigurations);
  const keywords = uniqueNonblankStrings([
    category,
    sourceName,
    ...displays.flatMap((configuration) =>
      configuration.sourceName === undefined ? [] : [configuration.sourceName],
    ),
  ]);

  let exactTerms: readonly string[];
  let description = "";
  let popularityRank: number | null = null;

  if (kind === "browse_only") {
    exactTerms = uniqueNonblankStrings([
      slug,
      ...displays.map((configuration) => configuration.displayCode),
      ...displays.map((configuration) => configuration.packageForm),
    ]);
  } else {
    const aliases = stringArray(product.aliases);
    const variants = arrayValue(product.variants).map((candidateVariant) => {
      const current = record(candidateVariant);
      return {
        sku: stringValue(current.sku),
        label: stringValue(current.label),
      };
    });
    const configuredRank = product.popularityRank;
    if (
      configuredRank !== null &&
      (typeof configuredRank !== "number" || !Number.isFinite(configuredRank))
    ) {
      invalidInput();
    }
    popularityRank = configuredRank;

    const approvedDescriptionParts: string[] = [];
    for (const candidateContent of arrayValue(product.content)) {
      const content = record(candidateContent);
      if (content.status !== "approved") invalidInput();
      const contentKind = stringValue(content.kind);
      if (contentKind !== "product_information") continue;
      approvedDescriptionParts.push(
        stringValue(content.title),
        stringValue(content.body),
      );
    }
    description = approvedDescriptionParts.join(" ");
    exactTerms = uniqueNonblankStrings([
      slug,
      ...aliases,
      ...variants.map((variant) => variant.sku),
      ...variants.map((variant) => variant.label),
    ]);
  }

  return Object.freeze({
    id: `product:${slug}`,
    group: "products",
    title,
    href: `/catalog/items/${slug}`,
    description,
    exactTerms,
    keywords,
    popularityRank,
  });
}

function informationEntry(candidate: unknown): SearchEntry {
  const information = record(candidate);
  if (information.status !== "approved") invalidInput();
  const id = nonblankTrimmedString(information.id);
  const keywords = stringArray(information.keywords);
  if (keywords.some((keyword) => keyword.trim().length === 0)) invalidInput();

  return Object.freeze({
    id: `information:${id}`,
    group: "information",
    title: nonblankTrimmedString(information.title),
    href: stringValue(information.href),
    description: nonblankTrimmedString(information.description),
    exactTerms: Object.freeze([] as string[]),
    keywords: Object.freeze([...keywords]),
    popularityRank: null,
  });
}

function projectIndex(input: unknown): StorefrontSearchIndex {
  const source = record(input);
  const products = arrayValue(source.products);
  const information = arrayValue(source.information);
  const entries = [
    ...products.map(productEntry),
    ...information.map(informationEntry),
  ];
  const ids = new Set<string>();
  const hrefs = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id) || hrefs.has(entry.href)) invalidInput();
    ids.add(entry.id);
    hrefs.add(entry.href);
  }

  return Object.freeze({
    version: 1,
    entries: Object.freeze(entries),
  });
}

export function buildStorefrontSearchIndex(
  input: StorefrontSearchIndexInput,
): StorefrontSearchIndex {
  try {
    return projectIndex(input);
  } catch {
    return invalidInput();
  }
}
