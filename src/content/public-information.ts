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
  if (!Array.isArray(value)) throw new TypeError("Invalid public information input.");
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) {
    throw new TypeError("Invalid public information input.");
  }
  const length = lengthDescriptor.value as unknown;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new TypeError("Invalid public information input.");
  }

  const arrayLength = length as number;
  const ownKeys = Reflect.ownKeys(value);
  let ownIndexCount = 0;
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const index = ownArrayIndex(ownKeys[keyIndex]!);
    if (index === null) continue;
    if (index >= arrayLength) {
      throw new TypeError("Invalid public information input.");
    }
    ownIndexCount += 1;
  }
  if (ownIndexCount !== arrayLength) {
    throw new TypeError("Invalid public information input.");
  }

  const snapshot = new Array<unknown>(arrayLength);
  for (let index = 0; index < arrayLength; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new TypeError("Invalid public information input.");
    }
    snapshot[index] = "value" in descriptor
      ? descriptor.value
      : descriptor.get === undefined
        ? undefined
        : Reflect.apply(descriptor.get, value, []);
  }
  return Object.freeze(snapshot);
}

function snapshotPublicInformationDestinations(
  value: unknown,
): readonly PublicInformationDestination[] {
  const candidates = denseArraySnapshot(value);
  const destinations: PublicInformationDestination[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("Invalid public information input.");
    }
    const record = candidate as Record<string, unknown>;
    const path = record.path;
    const anchorCandidates = denseArraySnapshot(record.allowedAnchors);
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("Invalid public information input.");
    }
    const allowedAnchors: string[] = [];
    for (let anchorIndex = 0; anchorIndex < anchorCandidates.length; anchorIndex += 1) {
      const anchor = anchorCandidates[anchorIndex];
      if (typeof anchor !== "string") {
        throw new TypeError("Invalid public information input.");
      }
      allowedAnchors.push(anchor);
    }
    destinations.push(Object.freeze({
      path: path as `/${string}`,
      allowedAnchors: Object.freeze(allowedAnchors),
    }));
  }
  return Object.freeze(destinations);
}

export function isApprovedPublicInformationHref(
  value: unknown,
  destinations: readonly PublicInformationDestination[] = publicInformationDestinations,
): value is `/${string}` {
  try {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      disallowedHrefCharacters.test(value)
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
    if (fragment !== null && !approvedFragment.test(fragment)) return false;

    const destinationCandidates = snapshotPublicInformationDestinations(destinations);
    for (let index = 0; index < destinationCandidates.length; index += 1) {
      const candidate = destinationCandidates[index];
      const destinationRecord = candidate!;
      const configuredPath = destinationRecord.path;
      const anchorCandidates = destinationRecord.allowedAnchors;
      if (configuredPath !== path) continue;
      if (fragment === null) return true;
      for (let anchorIndex = 0; anchorIndex < anchorCandidates.length; anchorIndex += 1) {
        const anchor = anchorCandidates[anchorIndex];
        if (typeof anchor !== "string") return false;
        if (anchor === fragment) return true;
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function cloneValidKeywords(value: unknown): readonly string[] | null {
  const candidates = denseArraySnapshot(value);
  const keywords: string[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const keyword = candidates[index];
    if (typeof keyword !== "string" || keyword.trim().length === 0) return null;
    keywords.push(keyword);
  }
  return Object.freeze(keywords);
}

const emptyApprovedPublicInformation: readonly ApprovedPublicInformation[] =
  Object.freeze([] as ApprovedPublicInformation[]);

export function getApprovedPublicInformation(
  records: readonly PublicInformationRecord[] = publicInformationRecords,
  destinations: readonly PublicInformationDestination[] = publicInformationDestinations,
): readonly ApprovedPublicInformation[] {
  const approved: ApprovedPublicInformation[] = [];

  try {
    const candidates = denseArraySnapshot(records);
    const destinationSnapshot = snapshotPublicInformationDestinations(destinations);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
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
          !isApprovedPublicInformationHref(href, destinationSnapshot)
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

type ApprovedHomepageWhyChooseInput = Readonly<{
  id: string;
  title: string;
  body: string;
}>;

type ApprovedHomepageFaqInput = Readonly<{
  id: string;
  question: string;
  answer: string;
  anchor: `faq-${string}`;
}>;

type ApprovedHomepageInput = Readonly<{
  whyChoose: readonly ApprovedHomepageWhyChooseInput[];
  faqs: readonly ApprovedHomepageFaqInput[];
}>;

export type ApprovedHomepageDestinationProjection = Readonly<{
  homepage: Readonly<{
    whyChoose: readonly ApprovedHomepageWhyChooseInput[];
    faqs: readonly ApprovedHomepageFaqInput[];
  }>;
  information: readonly ApprovedPublicInformation[];
}>;

const emptyApprovedHomepageDestinationProjection: ApprovedHomepageDestinationProjection =
  Object.freeze({
    homepage: Object.freeze({
      whyChoose: Object.freeze([] as ApprovedHomepageWhyChooseInput[]),
      faqs: Object.freeze([] as ApprovedHomepageFaqInput[]),
    }),
    information: Object.freeze([] as ApprovedPublicInformation[]),
  });

function cloneWhyChooseItem(
  value: unknown,
): ApprovedHomepageWhyChooseInput | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const title = value.title;
  const body = value.body;
  if (
    !isNonBlankTrimmedString(id) ||
    !isNonBlankTrimmedString(title) ||
    !isNonBlankTrimmedString(body)
  ) {
    return null;
  }
  return Object.freeze({ id, title, body });
}

function cloneFaqEntry(value: unknown): ApprovedHomepageFaqInput | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const question = value.question;
  const answer = value.answer;
  const anchor = value.anchor;
  if (
    !isNonBlankTrimmedString(id) ||
    !isNonBlankTrimmedString(question) ||
    !isNonBlankTrimmedString(answer) ||
    typeof anchor !== "string" ||
    anchor !== `faq-${id}`
  ) {
    return null;
  }
  return Object.freeze({ id, question, answer, anchor: `faq-${id}` });
}

export function projectHomepageContentForApprovedDestinations(
  homepage: ApprovedHomepageInput,
  destinations: readonly PublicInformationDestination[] = publicInformationDestinations,
): ApprovedHomepageDestinationProjection {
  try {
    if (homepage === null || typeof homepage !== "object" || Array.isArray(homepage)) {
      return emptyApprovedHomepageDestinationProjection;
    }
    const homepageRecord = homepage as unknown as Record<string, unknown>;
    const whyChooseCandidates = denseArraySnapshot(homepageRecord.whyChoose);
    const faqCandidates = denseArraySnapshot(homepageRecord.faqs);
    const destinationSnapshot = snapshotPublicInformationDestinations(destinations);

    const whyChoose: ApprovedHomepageWhyChooseInput[] = [];
    if (isApprovedPublicInformationHref("/#why-choose-propeptiq", destinationSnapshot)) {
      for (let index = 0; index < whyChooseCandidates.length; index += 1) {
        const item = cloneWhyChooseItem(whyChooseCandidates[index]);
        if (item !== null) whyChoose.push(item);
      }
    }

    const faqs: ApprovedHomepageFaqInput[] = [];
    if (isApprovedPublicInformationHref("/#faq", destinationSnapshot)) {
      for (let index = 0; index < faqCandidates.length; index += 1) {
        const faq = cloneFaqEntry(faqCandidates[index]);
        if (
          faq !== null &&
          isApprovedPublicInformationHref(`/#${faq.anchor}`, destinationSnapshot)
        ) {
          faqs.push(faq);
        }
      }
    }

    const frozenWhyChoose = Object.freeze(whyChoose);
    const frozenFaqs = Object.freeze(faqs);
    const information: ApprovedPublicInformation[] = [];

    if (frozenWhyChoose.length > 0) {
      const descriptionParts: string[] = [];
      const keywords: string[] = [];
      for (let index = 0; index < frozenWhyChoose.length; index += 1) {
        const item = frozenWhyChoose[index]!;
        descriptionParts.push(`${item.title}: ${item.body}`);
        keywords.push(item.title);
      }
      information.push(Object.freeze({
        id: "homepage:why-choose-propeptiq",
        title: "Why choose PropeptIQ",
        href: "/#why-choose-propeptiq",
        description: descriptionParts.join(" "),
        keywords: Object.freeze(keywords),
        status: "approved",
      }));
    }

    for (let index = 0; index < frozenFaqs.length; index += 1) {
      const faq = frozenFaqs[index]!;
      information.push(Object.freeze({
        id: `homepage:faq:${faq.id}`,
        title: faq.question,
        href: `/#${faq.anchor}`,
        description: faq.answer,
        keywords: Object.freeze([] as string[]),
        status: "approved",
      }));
    }

    return Object.freeze({
      homepage: Object.freeze({
        whyChoose: frozenWhyChoose,
        faqs: frozenFaqs,
      }),
      information: Object.freeze(information),
    });
  } catch {
    return emptyApprovedHomepageDestinationProjection;
  }
}
