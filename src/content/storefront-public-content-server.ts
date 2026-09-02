import "server-only";

import {
  getApprovedPublicInformation,
  projectHomepageContentForApprovedDestinations,
  publicInformationDestinations,
  publicInformationRecords,
  type ApprovedPublicInformation,
  type PublicInformationDestination,
  type PublicInformationRecord,
} from "@/content/public-information";
import {
  getApprovedHomepageContent,
  storefrontContentRecords,
  type ApprovedHomepageContent,
  type ControlledContentRecord,
} from "@/content/storefront-content";

export const PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE =
  "PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE" as const;

export type PublicStorefrontContentView = Readonly<{
  homepage: ApprovedHomepageContent;
  information: readonly ApprovedPublicInformation[];
}>;

export type PublicStorefrontContentViewDependencies = Readonly<{
  loadControlledContent?: () => unknown | Promise<unknown>;
  loadInformationRecords?: () => unknown | Promise<unknown>;
  loadDestinations?: () => unknown | Promise<unknown>;
  reportUnavailable?: (
    code: typeof PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE,
  ) => void;
}>;

const emptyHomepage = getApprovedHomepageContent([]);
const emptyPublicStorefrontContentView: PublicStorefrontContentView =
  Object.freeze({
    homepage: emptyHomepage,
    information: Object.freeze([] as ApprovedPublicInformation[]),
  });

function reportPublicStorefrontContentUnavailable(
  code: typeof PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE,
): void {
  console.warn(code);
}

function assertUniqueInformation(
  information: readonly ApprovedPublicInformation[],
): void {
  const ids = new Set<string>();
  const hrefs = new Set<string>();
  for (const entry of information) {
    if (ids.has(entry.id) || hrefs.has(entry.href)) {
      throw new TypeError("Invalid public storefront content view.");
    }
    ids.add(entry.id);
    hrefs.add(entry.href);
  }
}

export function createPublicStorefrontContentViewAccessor(
  dependencies: PublicStorefrontContentViewDependencies = {},
): () => Promise<PublicStorefrontContentView> {
  const loadControlledContent = dependencies.loadControlledContent ??
    (() => storefrontContentRecords);
  const loadInformationRecords = dependencies.loadInformationRecords ??
    (() => publicInformationRecords);
  const loadDestinations = dependencies.loadDestinations ??
    (() => publicInformationDestinations);
  const reportUnavailable = dependencies.reportUnavailable ??
    reportPublicStorefrontContentUnavailable;

  return async (): Promise<PublicStorefrontContentView> => {
    try {
      const [controlledContent, informationRecords, destinations] =
        await Promise.all([
          Promise.resolve().then(loadControlledContent),
          Promise.resolve().then(loadInformationRecords),
          Promise.resolve().then(loadDestinations),
        ]);
      const approvedHomepage = getApprovedHomepageContent(
        controlledContent as readonly ControlledContentRecord[],
      );
      const approvedManualInformation = getApprovedPublicInformation(
        informationRecords as readonly PublicInformationRecord[],
        destinations as readonly PublicInformationDestination[],
      );
      const homepageProjection =
        projectHomepageContentForApprovedDestinations(
          approvedHomepage,
          destinations as readonly PublicInformationDestination[],
        );
      const information = Object.freeze([
        ...approvedManualInformation,
        ...homepageProjection.information,
      ]);
      assertUniqueInformation(information);

      return Object.freeze({
        homepage: homepageProjection.homepage,
        information,
      });
    } catch {
      try {
        reportUnavailable(PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE);
      } catch {
        // A diagnostic failure must never take the public homepage down.
      }
      return emptyPublicStorefrontContentView;
    }
  };
}

export const getPublicStorefrontContentView =
  createPublicStorefrontContentViewAccessor();
