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

  it("snapshots every approved field once before validation and projection", () => {
    const reads = {
      id: 0,
      title: 0,
      href: 0,
      description: 0,
      keywords: 0,
      status: 0,
    };
    const once = <T,>(
      field: keyof typeof reads,
      first: T,
      later: T,
    ) => ({
      enumerable: true,
      get() {
        reads[field] += 1;
        return reads[field] === 1 ? first : later;
      },
    });
    const hostileRecord = Object.defineProperties({}, {
      id: once("id", "stable-approved-id", "mutated-id"),
      title: once("title", "Stable approved title", "Mutated title"),
      href: once("href", "/catalog", "https://external.invalid/catalog"),
      description: once(
        "description",
        "Stable approved description.",
        "Mutated description.",
      ),
      keywords: once("keywords", ["stable-keyword"], ["mutated-keyword"]),
      status: once("status", "approved", "retired"),
    });

    expect(
      getApprovedPublicInformation([
        hostileRecord as unknown as PublicInformationRecord,
      ]),
    ).toEqual([{
      id: "stable-approved-id",
      title: "Stable approved title",
      href: "/catalog",
      description: "Stable approved description.",
      keywords: ["stable-keyword"],
      status: "approved",
    }]);
    expect(reads).toEqual({
      id: 1,
      title: 1,
      href: 1,
      description: 1,
      keywords: 1,
      status: 1,
    });
  });

  it("returns a deeply frozen empty result when array iterator access throws", () => {
    const backing = [approvedRecord()];
    const records = new Proxy(backing, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          throw new Error("hostile iterator access");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    let projected: ReturnType<typeof getApprovedPublicInformation> | undefined;

    expect(() => {
      projected = getApprovedPublicInformation(records);
    }).not.toThrow();
    expect(projected).toEqual([]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(backing).toEqual([approvedRecord()]);
    expect(Object.isFrozen(backing)).toBe(false);
    expect(Object.isFrozen(backing[0])).toBe(false);
  });

  it("discards partial output when an array iterator throws mid-stream", () => {
    const first = approvedRecord({ id: "must-not-partially-project" });
    const backing = [first];
    const records = new Proxy(backing, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          return function* hostileIterator() {
            yield target[0]!;
            throw new Error("hostile mid-stream iterator");
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    let projected: ReturnType<typeof getApprovedPublicInformation> | undefined;

    expect(() => {
      projected = getApprovedPublicInformation(records);
    }).not.toThrow();
    expect(projected).toEqual([]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(backing).toEqual([first]);
    expect(Object.isFrozen(backing)).toBe(false);
    expect(Object.isFrozen(first)).toBe(false);
  });

  it("returns a deeply frozen empty result for a revoked array proxy", () => {
    const revocable = Proxy.revocable<PublicInformationRecord[]>(
      [approvedRecord()],
      {},
    );
    revocable.revoke();
    let projected: ReturnType<typeof getApprovedPublicInformation> | undefined;

    expect(() => {
      projected = getApprovedPublicInformation(revocable.proxy);
    }).not.toThrow();
    expect(projected).toEqual([]);
    expect(Object.isFrozen(projected)).toBe(true);
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
