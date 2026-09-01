import { describe, expect, it } from "vitest";

import {
  getApprovedPublicInformation,
  isApprovedPublicInformationHref,
  publicInformationDestinations,
  publicInformationRecords,
  type PublicInformationRecord,
} from "./public-information";

const exactProductionPaths = [
  "/",
  "/catalog",
  "/quality-records",
  "/research-use-policy",
  "/rewards",
  "/partners",
] as const;

function approvedRecord(overrides: Record<string, unknown> = {}): PublicInformationRecord {
  return {
    id: "approved-entry",
    title: "Synthetic approved information",
    href: "/quality-records",
    description: "Synthetic public-information fixture.",
    keywords: ["synthetic", "records"],
    status: "approved",
    ...overrides,
  } as PublicInformationRecord;
}

describe("approved public-information registry", () => {
  it("keeps the production registry empty and deeply freezes the exact destination policy", () => {
    expect(publicInformationRecords).toEqual([]);
    expect(Object.isFrozen(publicInformationRecords)).toBe(true);
    expect(publicInformationDestinations).toEqual(
      exactProductionPaths.map((path) => ({ path, allowedAnchors: [] })),
    );
    expect(Object.isFrozen(publicInformationDestinations)).toBe(true);
    for (const destination of publicInformationDestinations) {
      expect(Object.isFrozen(destination)).toBe(true);
      expect(Object.isFrozen(destination.allowedAnchors)).toBe(true);
    }
    expect(getApprovedPublicInformation()).toEqual([]);
    expect(Object.isFrozen(getApprovedPublicInformation())).toBe(true);
  });

  it("accepts every exact production path through the shared validator and projection", () => {
    for (const [index, href] of exactProductionPaths.entries()) {
      expect(isApprovedPublicInformationHref(href)).toBe(true);
      expect(
        getApprovedPublicInformation([
          approvedRecord({ id: `approved-${index}`, href }),
        ]).map((record) => record.href),
      ).toEqual([href]);
    }
  });

  it("publishes only structurally valid approved records in configured order", () => {
    const records = [
      approvedRecord({ id: "approved-second", href: "/partners" }),
      approvedRecord({ id: "draft-entry", href: "/catalog", status: "draft" }),
      approvedRecord({ id: "approved-first", href: "/" }),
      approvedRecord({ id: "retired-entry", href: "/rewards", status: "retired" }),
    ];

    expect(getApprovedPublicInformation(records).map((record) => record.id)).toEqual([
      "approved-second",
      "approved-first",
    ]);
  });

  it.each([
    ["blank id", { id: " " }],
    ["untrimmed id", { id: " approved-entry" }],
    ["blank title", { title: "\t" }],
    ["untrimmed title", { title: "Synthetic title " }],
    ["blank description", { description: "\n" }],
    ["untrimmed description", { description: " Synthetic description" }],
    ["missing keywords", { keywords: undefined }],
    ["non-array keywords", { keywords: "synthetic" }],
    ["blank keyword", { keywords: ["synthetic", " "] }],
    ["non-string keyword", { keywords: ["synthetic", 30] }],
    ["unknown status", { status: "published" }],
    ["non-string href", { href: 30 }],
  ] as const)("fails closed for a structurally invalid %s", (_label, override) => {
    expect(
      getApprovedPublicInformation([
        approvedRecord(override as Record<string, unknown>),
      ]),
    ).toEqual([]);
  });

  it("allowlist-projects six fields, deep-freezes output, and leaves caller input untouched", () => {
    const keywords = ["synthetic phrase", "records"];
    const input = {
      ...approvedRecord(),
      keywords,
      privateApprovalNote: "must-not-project",
      nestedPrivateData: { secret: "must-not-project" },
    };
    const before = structuredClone(input);

    const projected = getApprovedPublicInformation([
      input as unknown as PublicInformationRecord,
    ]);

    expect(projected).toEqual([{
      id: "approved-entry",
      title: "Synthetic approved information",
      href: "/quality-records",
      description: "Synthetic public-information fixture.",
      keywords: ["synthetic phrase", "records"],
      status: "approved",
    }]);
    expect(Object.keys(projected[0]!).sort()).toEqual([
      "description",
      "href",
      "id",
      "keywords",
      "status",
      "title",
    ]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected[0])).toBe(true);
    expect(Object.isFrozen(projected[0]!.keywords)).toBe(true);
    expect(projected[0]!.keywords).not.toBe(keywords);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(keywords)).toBe(false);
    expect(Object.isFrozen(input.nestedPrivateData)).toBe(false);
  });

  it("fails closed when a runtime record exposes a throwing field getter", () => {
    const hostileRecord = Object.defineProperty({}, "status", {
      enumerable: true,
      get() {
        throw new Error("hostile runtime field");
      },
    });

    expect(
      getApprovedPublicInformation([
        hostileRecord as unknown as PublicInformationRecord,
      ]),
    ).toEqual([]);
  });

  it("accepts only explicitly approved anchors for their exact configured path", () => {
    const destinations = Object.freeze([
      Object.freeze({
        path: "/" as const,
        allowedAnchors: Object.freeze(["faq-approved_entry", "section:quality"]),
      }),
      Object.freeze({
        path: "/partners" as const,
        allowedAnchors: Object.freeze(["terms-2026"]),
      }),
    ]);

    expect(isApprovedPublicInformationHref("/#faq-approved_entry", destinations)).toBe(true);
    expect(isApprovedPublicInformationHref("/#section:quality", destinations)).toBe(true);
    expect(isApprovedPublicInformationHref("/partners#terms-2026", destinations)).toBe(true);
    expect(isApprovedPublicInformationHref("/#faq-unapproved", destinations)).toBe(false);
    expect(isApprovedPublicInformationHref("/partners#faq-approved_entry", destinations)).toBe(false);
    expect(
      getApprovedPublicInformation(
        [
          approvedRecord({ id: "anchor-approved", href: "/#faq-approved_entry" }),
          approvedRecord({ id: "anchor-unapproved", href: "/#faq-unapproved" }),
        ],
        destinations,
      ).map((record) => record.href),
    ).toEqual(["/#faq-approved_entry"]);
  });

  it.each([
    ["external URL", "https://example.invalid/catalog"],
    ["protocol-relative URL", "//example.invalid/catalog"],
    ["protocol URL", "mailto:test@example.invalid"],
    ["backslash", "/catalog\\items"],
    ["percent escape", "/catalog%2Fitems"],
    ["leading whitespace", " /catalog"],
    ["embedded whitespace", "/quality records"],
    ["control character", "/catalog\u0000"],
    ["query", "/catalog?view=all"],
    ["protected path", "/admin"],
    ["internal path", "/api/catalog"],
    ["unknown route", "/missing"],
    ["nested catalog route", "/catalog/items/x"],
    ["nested partner route", "/partners/terms"],
    ["prefix-confusable route", "/catalogue"],
    ["trailing slash", "/catalog/"],
    ["doubled slash", "/catalog//"],
    ["empty fragment", "/catalog#"],
    ["multiple fragments", "/catalog#one#two"],
    ["fragment slash", "/catalog#one/two"],
    ["fragment whitespace", "/catalog#one two"],
    ["fragment percent escape", "/catalog#one%20two"],
    ["syntax-valid but unapproved fragment", "/catalog#approved-looking"],
  ] as const)("rejects %s", (_label, href) => {
    expect(isApprovedPublicInformationHref(href)).toBe(false);
    expect(getApprovedPublicInformation([approvedRecord({ href })])).toEqual([]);
  });
});
