export const siteName = "PROPEPTIQ LABS";

declare const approvedNewsletterPrivacyHrefBrand: unique symbol;

const approvedNewsletterPrivacyHrefKind = "approved-newsletter-privacy-href" as const;

export type ApprovedNewsletterPrivacyHref = Readonly<{
  href: `/${string}`;
  kind: typeof approvedNewsletterPrivacyHrefKind;
  [approvedNewsletterPrivacyHrefBrand]: true;
}>;

export type NewsletterPrivacyDestinationPolicy = readonly `/${string}`[];

const unsafeNewsletterHrefCharacters = /[\s\u0000-\u001f\u007f-\u009f\\?#%]/u;
const newsletterHrefSegment = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const protectedNewsletterPaths = Object.freeze([
  "/account",
  "/admin",
  "/api",
  "/checkout",
  "/sign-in",
  "/sign-up",
  "/_next",
  "/__synthetic_local_checkout",
] as const);

function isSafeNewsletterPrivacyPath(value: unknown): value is `/${string}` {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.endsWith("/") ||
    value.includes("//") ||
    unsafeNewsletterHrefCharacters.test(value)
  ) {
    return false;
  }

  for (const protectedPath of protectedNewsletterPaths) {
    if (value === protectedPath || value.startsWith(`${protectedPath}/`)) {
      return false;
    }
  }

  const segments = value.slice(1).split("/");
  return segments.every((segment) => newsletterHrefSegment.test(segment));
}

function snapshotNewsletterPrivacyDestinations(
  policy: NewsletterPrivacyDestinationPolicy,
): readonly `/${string}`[] | null {
  try {
    if (!Array.isArray(policy)) return null;
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(policy, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      (lengthDescriptor.value as number) < 0
    ) {
      return null;
    }
    const length = lengthDescriptor.value as number;
    const snapshot: `/${string}`[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(policy, String(index));
      if (descriptor === undefined) return null;
      const destination = "value" in descriptor
        ? descriptor.value
        : descriptor.get === undefined
          ? undefined
          : Reflect.apply(descriptor.get, policy, []);
      if (!isSafeNewsletterPrivacyPath(destination)) return null;
      snapshot.push(destination);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

export function projectApprovedNewsletterPrivacyHref(
  value: unknown,
  policy: NewsletterPrivacyDestinationPolicy,
): ApprovedNewsletterPrivacyHref | null {
  if (!isSafeNewsletterPrivacyPath(value)) return null;
  const destinations = snapshotNewsletterPrivacyDestinations(policy);
  if (destinations === null) return null;
  for (let index = 0; index < destinations.length; index += 1) {
    if (destinations[index] === value) {
      return Object.freeze({
        href: value,
        kind: approvedNewsletterPrivacyHrefKind,
      }) as ApprovedNewsletterPrivacyHref;
    }
  }
  return null;
}

export function isApprovedNewsletterPrivacyHref(
  value: unknown,
  policy?: NewsletterPrivacyDestinationPolicy | undefined,
): value is ApprovedNewsletterPrivacyHref {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes("href") || !keys.includes("kind")) {
      return false;
    }
    const hrefDescriptor = Reflect.getOwnPropertyDescriptor(value, "href");
    const kindDescriptor = Reflect.getOwnPropertyDescriptor(value, "kind");
    if (
      hrefDescriptor === undefined ||
      kindDescriptor === undefined ||
      !("value" in hrefDescriptor) ||
      !("value" in kindDescriptor) ||
      kindDescriptor.value !== approvedNewsletterPrivacyHrefKind ||
      !isSafeNewsletterPrivacyPath(hrefDescriptor.value)
    ) {
      return false;
    }
    return policy === undefined ||
      projectApprovedNewsletterPrivacyHref(hrefDescriptor.value, policy) !== null;
  } catch {
    return false;
  }
}

export const newsletterPrivacyDestinations: NewsletterPrivacyDestinationPolicy =
  Object.freeze([] as `/${string}`[]);

export const newsletterConfiguration: Readonly<{
  privacyHref: ApprovedNewsletterPrivacyHref | null;
}> = Object.freeze({
  privacyHref: projectApprovedNewsletterPrivacyHref(
    null,
    newsletterPrivacyDestinations,
  ),
});

export const publicNavigation = [
  { label: "Catalog", href: "/catalog" },
  { label: "Quality Records", href: "/quality-records" },
  { label: "Research Use", href: "/research-use-policy" },
  { label: "Rewards", href: "/rewards" },
] as const;

export const researchRestrictions = [
  "For legitimate laboratory and research use only.",
  "Not for human or veterinary use.",
] as const;

export const proofStages = [
  "Material identity",
  "Analytical method",
  "Lot/batch",
  "COA state",
] as const;
