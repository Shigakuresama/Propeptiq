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

function validKeywords(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(
    (keyword) => typeof keyword === "string" && keyword.trim().length > 0,
  );
}

export function getApprovedPublicInformation(
  records: readonly PublicInformationRecord[] = publicInformationRecords,
  destinations: readonly PublicInformationDestination[] = publicInformationDestinations,
): readonly ApprovedPublicInformation[] {
  const runtimeRecords: readonly unknown[] = Array.isArray(records) ? records : [];
  const approved: ApprovedPublicInformation[] = [];

  for (const candidate of runtimeRecords) {
    try {
      if (
        !isRecord(candidate) ||
        candidate.status !== "approved" ||
        !isNonBlankTrimmedString(candidate.id) ||
        !isNonBlankTrimmedString(candidate.title) ||
        !isNonBlankTrimmedString(candidate.description) ||
        !validKeywords(candidate.keywords) ||
        !isApprovedPublicInformationHref(candidate.href, destinations)
      ) {
        continue;
      }

      const keywords = Object.freeze([...candidate.keywords]);
      approved.push(Object.freeze({
        id: candidate.id,
        title: candidate.title,
        href: candidate.href,
        description: candidate.description,
        keywords,
        status: "approved" as const,
      }));
    } catch {
      // Runtime-loose records fail closed without freezing caller-owned input.
    }
  }

  return Object.freeze(approved);
}
