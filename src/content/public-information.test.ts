import { describe, expect, it } from "vitest";

import {
  getApprovedPublicInformation,
  isApprovedPublicInformationHref,
  projectHomepageContentForApprovedDestinations,
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

  it("ignores a throwing custom array iterator and snapshots dense own indices", () => {
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
    expect(projected).toEqual([approvedRecord()]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(backing).toEqual([approvedRecord()]);
    expect(Object.isFrozen(backing)).toBe(false);
    expect(Object.isFrozen(backing[0])).toBe(false);
  });

  it("ignores a custom mid-stream iterator without invoking it", () => {
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
    expect(projected).toEqual([first]);
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

  it("rejects sparse record and keyword arrays without partial projection", () => {
    const sparseRecords = new Array<PublicInformationRecord>(2);
    sparseRecords[0] = approvedRecord({ id: "must-not-partially-project" });
    const sparseKeywords = new Array<string>(2);
    sparseKeywords[0] = "fictional";

    expect(getApprovedPublicInformation(sparseRecords)).toEqual([]);
    expect(getApprovedPublicInformation([
      approvedRecord({ keywords: sparseKeywords }),
    ])).toEqual([]);
  });

  it("ignores caller map, some, and iterator overrides on runtime arrays", () => {
    const keywords = ["fictional"];
    Object.defineProperties(keywords, {
      map: { value: () => { throw new Error("must-not-call-map"); } },
      some: { value: () => { throw new Error("must-not-call-some"); } },
      [Symbol.iterator]: {
        value: () => { throw new Error("must-not-call-iterator"); },
      },
    });
    const runtimeRecords = [approvedRecord({ keywords })];
    Object.defineProperties(runtimeRecords, {
      map: { value: () => { throw new Error("must-not-call-map"); } },
      [Symbol.iterator]: {
        value: () => { throw new Error("must-not-call-iterator"); },
      },
    });

    expect(getApprovedPublicInformation(runtimeRecords)).toEqual([
      approvedRecord({ keywords: ["fictional"] }),
    ]);
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

const fictionalHomepage = Object.freeze({
  whyChoose: Object.freeze([
    Object.freeze({
      id: "fictional-value-one",
      title: "Fictional value one",
      body: "Fictional value body one.",
    }),
    Object.freeze({
      id: "fictional-value-two",
      title: "Fictional value two",
      body: "Fictional value body two.",
    }),
  ]),
  faqs: Object.freeze([
    Object.freeze({
      id: "fictional-question-one",
      question: "First fictional question?",
      answer: "First fictional answer.",
      anchor: "faq-fictional-question-one" as const,
    }),
    Object.freeze({
      id: "fictional-question-two",
      question: "Second fictional question?",
      answer: "Second fictional answer.",
      anchor: "faq-fictional-question-two" as const,
    }),
  ]),
});

function homepageDestinations(anchors: readonly string[]) {
  return Object.freeze([
    Object.freeze({
      path: "/" as const,
      allowedAnchors: Object.freeze([...anchors]),
    }),
  ]);
}

describe("approved homepage destination join", () => {
  it("renders and indexes only content with every exact approved section/item anchor", () => {
    const projected = projectHomepageContentForApprovedDestinations(
      fictionalHomepage,
      homepageDestinations([
        "why-choose-propeptiq",
        "faq",
        "faq-fictional-question-one",
        "faq-fictional-question-two",
      ]),
    );

    expect(projected.homepage).toEqual(fictionalHomepage);
    expect(projected.information).toEqual([
      {
        id: "homepage:why-choose-propeptiq",
        title: "Why choose PropeptIQ",
        href: "/#why-choose-propeptiq",
        description: "Fictional value one: Fictional value body one. Fictional value two: Fictional value body two.",
        keywords: ["Fictional value one", "Fictional value two"],
        status: "approved",
      },
      {
        id: "homepage:faq:fictional-question-one",
        title: "First fictional question?",
        href: "/#faq-fictional-question-one",
        description: "First fictional answer.",
        keywords: [],
        status: "approved",
      },
      {
        id: "homepage:faq:fictional-question-two",
        title: "Second fictional question?",
        href: "/#faq-fictional-question-two",
        description: "Second fictional answer.",
        keywords: [],
        status: "approved",
      },
    ]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.homepage)).toBe(true);
    expect(Object.isFrozen(projected.homepage.whyChoose)).toBe(true);
    expect(Object.isFrozen(projected.homepage.faqs)).toBe(true);
    expect(Object.isFrozen(projected.information)).toBe(true);
    for (const entry of projected.information) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.keywords)).toBe(true);
    }
  });

  it("fails each section or item closed when its exact destination anchor is absent", () => {
    const withoutWhySection = projectHomepageContentForApprovedDestinations(
      fictionalHomepage,
      homepageDestinations([
        "faq",
        "faq-fictional-question-one",
        "faq-fictional-question-two",
      ]),
    );
    expect(withoutWhySection.homepage.whyChoose).toEqual([]);
    expect(withoutWhySection.information.map((entry) => entry.id)).toEqual([
      "homepage:faq:fictional-question-one",
      "homepage:faq:fictional-question-two",
    ]);

    const withoutFaqSection = projectHomepageContentForApprovedDestinations(
      fictionalHomepage,
      homepageDestinations([
        "why-choose-propeptiq",
        "faq-fictional-question-one",
        "faq-fictional-question-two",
      ]),
    );
    expect(withoutFaqSection.homepage.faqs).toEqual([]);
    expect(withoutFaqSection.information.map((entry) => entry.id)).toEqual([
      "homepage:why-choose-propeptiq",
    ]);

    const withoutSecondFaq = projectHomepageContentForApprovedDestinations(
      fictionalHomepage,
      homepageDestinations([
        "why-choose-propeptiq",
        "faq",
        "faq-fictional-question-one",
      ]),
    );
    expect(withoutSecondFaq.homepage.faqs.map((faq) => faq.id)).toEqual([
      "fictional-question-one",
    ]);
    expect(withoutSecondFaq.information.map((entry) => entry.id)).toEqual([
      "homepage:why-choose-propeptiq",
      "homepage:faq:fictional-question-one",
    ]);
  });

  it("does not accept prefix-looking or mismatched FAQ anchors", () => {
    const mismatched = {
      ...fictionalHomepage,
      faqs: [{
        ...fictionalHomepage.faqs[0]!,
        anchor: "faq-fictional-question-one-extra" as const,
      }],
    };
    const projected = projectHomepageContentForApprovedDestinations(
      mismatched,
      homepageDestinations([
        "faq",
        "faq-fictional-question-one",
        "faq-fictional-question-one-extra",
      ]),
    );

    expect(projected.homepage.faqs).toEqual([]);
    expect(projected.information).toEqual([]);
  });

  it("recursively strips lifecycle, source, raw, provider, and commerce fields from loose safe-view inputs", () => {
    const looseHomepage = {
      whyChoose: [{
        ...fictionalHomepage.whyChoose[0]!,
        approvalNote: "must-not-project",
        provider: { token: "must-not-project" },
      }],
      faqs: [{
        ...fictionalHomepage.faqs[0]!,
        sourceReferences: ["must-not-project"],
        stripePriceId: "must-not-project",
        cart: { quantity: 30 },
      }],
      rawRecords: ["must-not-project"],
    };

    const projected = projectHomepageContentForApprovedDestinations(
      looseHomepage,
      homepageDestinations([
        "why-choose-propeptiq",
        "faq",
        "faq-fictional-question-one",
      ]),
    );
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toMatch(/approval|sourceReferences|rawRecords|provider|stripe|cart/iu);
    expect(Object.keys(projected.homepage.whyChoose[0]!).sort()).toEqual([
      "body",
      "id",
      "title",
    ]);
    expect(Object.keys(projected.homepage.faqs[0]!).sort()).toEqual([
      "anchor",
      "answer",
      "id",
      "question",
    ]);
  });

  it("keeps the production destination policy and registry unchanged with no approved homepage anchors", () => {
    const projected = projectHomepageContentForApprovedDestinations(
      { whyChoose: [], faqs: [] },
      publicInformationDestinations,
    );

    expect(projected).toEqual({
      homepage: { whyChoose: [], faqs: [] },
      information: [],
    });
    expect(publicInformationDestinations.every((entry) => entry.allowedAnchors.length === 0)).toBe(true);
    expect(publicInformationRecords).toEqual([]);
  });

  it("keeps public-information browser-safe and free of raw/server/provider authority imports", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/content/public-information.ts", "utf8");

    expect(source).not.toMatch(/storefront-content|server-only|process\.env|@\/env|@\/db|stripe|provider/iu);
  });

  it("rejects sparse homepage arrays and revoked destination proxies without partial output", () => {
    const sparseWhyChoose = new Array<(typeof fictionalHomepage.whyChoose)[number]>(2);
    sparseWhyChoose[0] = fictionalHomepage.whyChoose[0]!;
    const revocable = Proxy.revocable([...homepageDestinations([
      "why-choose-propeptiq",
      "faq",
      "faq-fictional-question-one",
      "faq-fictional-question-two",
    ])], {});
    revocable.revoke();

    expect(projectHomepageContentForApprovedDestinations(
      { whyChoose: sparseWhyChoose, faqs: fictionalHomepage.faqs },
      homepageDestinations(["why-choose-propeptiq", "faq"]),
    )).toEqual({ homepage: { whyChoose: [], faqs: [] }, information: [] });
    expect(projectHomepageContentForApprovedDestinations(
      fictionalHomepage,
      revocable.proxy,
    )).toEqual({ homepage: { whyChoose: [], faqs: [] }, information: [] });
  });

  it("ignores custom homepage and anchor iterators and snapshots item fields once", () => {
    const reads = { id: 0, title: 0, body: 0 };
    const once = <T,>(field: keyof typeof reads, first: T, later: T) => ({
      enumerable: true,
      get() {
        reads[field] += 1;
        return reads[field] === 1 ? first : later;
      },
    });
    const hostileWhy = Object.defineProperties({}, {
      id: once("id", "stable-value", "mutated-value"),
      title: once("title", "Stable fictional value", "Mutated title"),
      body: once("body", "Stable fictional body.", "Mutated body."),
    });
    const whyChoose = [hostileWhy];
    Object.defineProperties(whyChoose, {
      map: { value: () => { throw new Error("must-not-call-map"); } },
      [Symbol.iterator]: {
        value: () => { throw new Error("must-not-call-iterator"); },
      },
    });
    const anchors = ["why-choose-propeptiq"];
    Object.defineProperties(anchors, {
      includes: { value: () => { throw new Error("must-not-call-includes"); } },
      [Symbol.iterator]: {
        value: () => { throw new Error("must-not-call-iterator"); },
      },
    });

    const projected = projectHomepageContentForApprovedDestinations(
      { whyChoose: whyChoose as never, faqs: [] },
      [{ path: "/", allowedAnchors: anchors }],
    );

    expect(projected.homepage.whyChoose).toEqual([{
      id: "stable-value",
      title: "Stable fictional value",
      body: "Stable fictional body.",
    }]);
    expect(reads).toEqual({ id: 1, title: 1, body: 1 });
  });

  it("snapshots the caller destination policy once before evaluating every homepage anchor", () => {
    const reads = { path: 0, allowedAnchors: 0 };
    const destination = Object.defineProperties({}, {
      path: {
        enumerable: true,
        get() {
          reads.path += 1;
          return reads.path === 1 ? "/" : "/mutated";
        },
      },
      allowedAnchors: {
        enumerable: true,
        get() {
          reads.allowedAnchors += 1;
          return reads.allowedAnchors === 1
            ? [
                "why-choose-propeptiq",
                "faq",
                "faq-fictional-question-one",
                "faq-fictional-question-two",
              ]
            : [];
        },
      },
    });

    const projected = projectHomepageContentForApprovedDestinations(
      fictionalHomepage,
      [destination as never],
    );

    expect(projected.homepage).toEqual(fictionalHomepage);
    expect(projected.information).toHaveLength(3);
    expect(reads).toEqual({ path: 1, allowedAnchors: 1 });
  });
});
