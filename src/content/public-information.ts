export type PublicInformationRecord = Readonly<{
  id: string;
  title: string;
  href: string;
  description: string;
  keywords: readonly string[];
  status: "draft" | "approved" | "retired";
}>;

export type ApprovedPublicInformation = Readonly<{
  id: string;
  title: string;
  href: `/${string}`;
  description: string;
  keywords: readonly string[];
  status: "approved";
}>;

export type PublicInformationDestination = Readonly<{
  path: `/${string}`;
  allowedAnchors: readonly string[];
}>;

function destination(path: `/${string}`): PublicInformationDestination {
  return Object.freeze({
    path,
    allowedAnchors: Object.freeze([] as string[]),
  });
}

export const publicInformationDestinations: readonly PublicInformationDestination[] =
  Object.freeze([
    destination("/"),
    destination("/catalog"),
    destination("/quality-records"),
    destination("/research-use-policy"),
    destination("/rewards"),
    destination("/partners"),
  ]);

export const publicInformationRecords: readonly PublicInformationRecord[] =
  Object.freeze([] as PublicInformationRecord[]);

const disallowedHrefCharacters = /[\s\u0000-\u001f\u007f-\u009f\\?%]/u;
const approvedFragment = /^[A-Za-z0-9_:-]+$/u;

export function isApprovedPublicInformationHref(
  value: unknown,
  destinations: readonly PublicInformationDestination[] = publicInformationDestinations,
): value is `/${string}` {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    disallowedHrefCharacters.test(value) ||
    !Array.isArray(destinations)
  ) {
    return false;
  }

  const fragmentSeparator = value.indexOf("#");
  if (
    fragmentSeparator !== -1 &&
    value.indexOf("#", fragmentSeparator + 1) !== -1
  ) {
    return false;
  }

  const path = fragmentSeparator === -1
    ? value
    : value.slice(0, fragmentSeparator);
  const fragment = fragmentSeparator === -1
    ? null
    : value.slice(fragmentSeparator + 1);
  const configuredDestination = destinations.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      candidate.path === path &&
      Array.isArray(candidate.allowedAnchors),
  );
  if (!configuredDestination) return false;
  if (fragment === null) return true;
  if (!approvedFragment.test(fragment)) return false;
  return configuredDestination.allowedAnchors.includes(fragment);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function cloneValidKeywords(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const keywords: unknown[] = [...value];
  if (!keywords.every(
    (keyword) => typeof keyword === "string" && keyword.trim().length > 0,
  )) {
    return null;
  }
  return Object.freeze(keywords as string[]);
}

const emptyApprovedPublicInformation: readonly ApprovedPublicInformation[] =
  Object.freeze([] as ApprovedPublicInformation[]);

export function getApprovedPublicInformation(
  records: readonly PublicInformationRecord[] = publicInformationRecords,
  destinations: readonly PublicInformationDestination[] = publicInformationDestinations,
): readonly ApprovedPublicInformation[] {
  const approved: ApprovedPublicInformation[] = [];

  try {
    if (!Array.isArray(records)) return emptyApprovedPublicInformation;

    for (const candidate of records as readonly unknown[]) {
      try {
        if (!isRecord(candidate)) continue;
        const id = candidate.id;
        const title = candidate.title;
        const href = candidate.href;
        const description = candidate.description;
        const keywords = cloneValidKeywords(candidate.keywords);
        const status = candidate.status;
        if (
          status !== "approved" ||
          !isNonBlankTrimmedString(id) ||
          !isNonBlankTrimmedString(title) ||
          !isNonBlankTrimmedString(description) ||
          keywords === null ||
          !isApprovedPublicInformationHref(href, destinations)
        ) {
          continue;
        }

        approved.push(Object.freeze({
          id,
          title,
          href,
          description,
          keywords,
          status,
        }));
      } catch {
        // Runtime-loose records fail closed without freezing caller-owned input.
      }
    }
  } catch {
    return emptyApprovedPublicInformation;
  }

  return Object.freeze(approved);
}
