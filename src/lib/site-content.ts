import type { Route } from "next";

export const siteName = "PROPEPTIQ LABS";

declare const approvedNewsletterPrivacyHrefBrand: unique symbol;

const approvedNewsletterPrivacyHrefKind = "approved-newsletter-privacy-href" as const;
const newsletterPrivacyLinkViewKind = "newsletter-privacy-link-view" as const;

export type ApprovedNewsletterPrivacyHref = Readonly<{
  href: `/${string}`;
  kind: typeof approvedNewsletterPrivacyHrefKind;
  [approvedNewsletterPrivacyHrefBrand]: true;
}>;

/**
 * Serializable rendering data only. Business approval remains represented by
 * ApprovedNewsletterPrivacyHref and is enforced again by the API runtime.
 */
export type NewsletterPrivacyLinkView = Readonly<{
  href: `/${string}`;
  kind: typeof newsletterPrivacyLinkViewKind;
}>;

const projectedNewsletterPrivacyHrefs = new WeakSet<object>();

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

function newsletterPrivacyPolicyContains(
  value: `/${string}`,
  policy: NewsletterPrivacyDestinationPolicy,
): boolean {
  const destinations = snapshotNewsletterPrivacyDestinations(policy);
  if (destinations === null) return false;
  for (let index = 0; index < destinations.length; index += 1) {
    if (destinations[index] === value) return true;
  }
  return false;
}

export function projectApprovedNewsletterPrivacyHref(
  value: unknown,
  policy: NewsletterPrivacyDestinationPolicy,
): ApprovedNewsletterPrivacyHref | null {
  if (!isSafeNewsletterPrivacyPath(value)) return null;
  if (!newsletterPrivacyPolicyContains(value, policy)) return null;
  const projected = Object.freeze({
    href: value,
    kind: approvedNewsletterPrivacyHrefKind,
  }) as ApprovedNewsletterPrivacyHref;
  projectedNewsletterPrivacyHrefs.add(projected);
  return projected;
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
    if (policy !== undefined) {
      return newsletterPrivacyPolicyContains(hrefDescriptor.value, policy);
    }
    return projectedNewsletterPrivacyHrefs.has(value) ||
      newsletterPrivacyPolicyContains(
        hrefDescriptor.value,
        newsletterPrivacyDestinations,
      );
  } catch {
    return false;
  }
}

export function projectNewsletterPrivacyLinkView(
  value: unknown,
): NewsletterPrivacyLinkView | null {
  if (!isApprovedNewsletterPrivacyHref(value)) return null;
  return Object.freeze({
    href: value.href,
    kind: newsletterPrivacyLinkViewKind,
  });
}

/**
 * Validates only the serialized client rendering shape and safe route syntax;
 * it does not grant business approval or server subscription authority.
 */
export function isNewsletterPrivacyLinkView(
  value: unknown,
): value is NewsletterPrivacyLinkView {
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
    return hrefDescriptor !== undefined &&
      kindDescriptor !== undefined &&
      "value" in hrefDescriptor &&
      "value" in kindDescriptor &&
      kindDescriptor.value === newsletterPrivacyLinkViewKind &&
      isSafeNewsletterPrivacyPath(hrefDescriptor.value);
  } catch {
    return false;
  }
}

export const newsletterPrivacyDestinations: NewsletterPrivacyDestinationPolicy =
  Object.freeze([] as `/${string}`[]);

export const newsletterConfiguration: Readonly<{
  enabled: boolean;
  privacyHref: ApprovedNewsletterPrivacyHref | null;
}> = Object.freeze({
  enabled: false,
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

export type FooterNavigationLink = Readonly<{
  label: string;
  href: Route | null;
}>;

export type FooterNavigationGroup = Readonly<{
  label: string;
  links: readonly FooterNavigationLink[];
}>;

function footerNavigationGroup(
  label: string,
  links: readonly FooterNavigationLink[],
): FooterNavigationGroup {
  return Object.freeze({
    label,
    links: Object.freeze(
      links.map((link) => Object.freeze({ label: link.label, href: link.href })),
    ),
  });
}

export const footerNavigationGroups: readonly FooterNavigationGroup[] =
  Object.freeze([
    footerNavigationGroup("Shop", [
      { label: "Catalog", href: "/catalog" },
      { label: "Cart", href: "/cart" },
      { label: "Rewards", href: "/rewards" },
      { label: "Partner Program", href: "/partners" },
    ]),
    footerNavigationGroup("Support", [
      { label: "Quality Records", href: "/quality-records" },
      { label: "Order tracking", href: "/account/orders" },
      { label: "FAQ", href: "/#faq" },
      { label: "Contact or Support", href: null },
      { label: "Shipping information", href: null },
    ]),
    footerNavigationGroup("Legal", [
      { label: "Research Use Only", href: "/research-use-policy" },
      { label: "Privacy Policy", href: null },
      { label: "Terms and Conditions", href: null },
      { label: "Shipping and Returns", href: null },
      { label: "Refund Policy", href: null },
      { label: "FDA Disclaimer", href: null },
    ]),
  ]);

export type FooterSocialPlatform = "instagram" | "tiktok" | "x" | "facebook";

export type FooterSocialUrlConfiguration = Readonly<
  Record<FooterSocialPlatform, string>
>;

export type FooterSocialLink = Readonly<{
  platform: FooterSocialPlatform;
  label: "Instagram" | "TikTok" | "X" | "Facebook";
  href: string;
}>;

export const footerSocialUrls: FooterSocialUrlConfiguration = Object.freeze({
  instagram: "/",
  tiktok: "/",
  x: "/",
  facebook: "/",
});

const footerSocialDefinitions = Object.freeze([
  Object.freeze({ platform: "instagram", label: "Instagram" }),
  Object.freeze({ platform: "tiktok", label: "TikTok" }),
  Object.freeze({ platform: "x", label: "X" }),
  Object.freeze({ platform: "facebook", label: "Facebook" }),
] as const);
const emptyFooterSocialLinks: readonly FooterSocialLink[] = Object.freeze([]);

const unsafeSocialUrlCharacters = /[\s\u0000-\u001f\u007f-\u009f]/u;
const encodedSocialControlCharacter = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu;

function isSafeFooterSocialHref(value: unknown): value is string {
  if (value === "/") return true;
  if (
    typeof value !== "string" ||
    unsafeSocialUrlCharacters.test(value) ||
    encodedSocialControlCharacter.test(value)
  ) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0;
  } catch {
    return false;
  }
}

export function projectFooterSocialLinks(
  values: Readonly<Partial<Record<FooterSocialPlatform, unknown>>> =
    footerSocialUrls,
): readonly FooterSocialLink[] {
  try {
    if (values === null || typeof values !== "object" || Array.isArray(values)) {
      return emptyFooterSocialLinks;
    }
  } catch {
    return emptyFooterSocialLinks;
  }

  const projected: FooterSocialLink[] = [];
  for (const definition of footerSocialDefinitions) {
    try {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        values,
        definition.platform,
      );
      if (descriptor === undefined || !("value" in descriptor)) continue;
      if (!isSafeFooterSocialHref(descriptor.value)) continue;
      projected.push(Object.freeze({
        platform: definition.platform,
        label: definition.label,
        href: descriptor.value,
      }));
    } catch {
      continue;
    }
  }
  return Object.freeze(projected);
}

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
