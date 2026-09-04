import { describe, expect, it, vi } from "vitest";

import { buildStorefrontSearchIndex } from "@/search/storefront-index";
import { searchEntries } from "@/search/storefront-search";

import {
  createPublicStorefrontContentViewAccessor,
  getPublicStorefrontContentView,
} from "./storefront-public-content-server";

function approvedWhy(id = "fictional-value") {
  return {
    id,
    kind: "why_choose" as const,
    status: "approved" as const,
    title: "Fictional value",
    body: "Fictional value body.",
    sourceReferences: ["fictional-source"],
    approvalNote: "Fictional fixture",
    reviewedAt: "2026-08-31T00:00:00.000Z",
    effectiveAt: null,
  };
}

function approvedFaq(id = "fictional-question") {
  return {
    ...approvedWhy(id),
    kind: "faq" as const,
    title: "Fictional question?",
    body: "Fictional answer.",
  };
}

function approvedInformation(overrides: Record<string, unknown> = {}) {
  return {
    id: "manual-information",
    title: "Fictional manual information",
    href: "/quality-records",
    description: "Fictional manual description.",
    keywords: ["fictional"],
    status: "approved",
    ...overrides,
  };
}

const exactDestinations = Object.freeze([
  Object.freeze({
    path: "/" as const,
    allowedAnchors: Object.freeze([
      "why-choose-propeptiq",
      "faq",
      "faq-fictional-question",
    ]),
  }),
  Object.freeze({ path: "/quality-records" as const, allowedAnchors: Object.freeze([]) }),
]);

describe("server-only public storefront content view", () => {
  it("loads every dependency once and returns manual information before exact homepage-derived information", async () => {
    const loadControlledContent = vi.fn(() => [approvedWhy(), approvedFaq()]);
    const loadInformationRecords = vi.fn(() => [approvedInformation()]);
    const loadDestinations = vi.fn(() => exactDestinations);
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent,
      loadInformationRecords,
      loadDestinations,
      reportUnavailable,
    });

    const view = await getView();

    expect(loadControlledContent).toHaveBeenCalledOnce();
    expect(loadInformationRecords).toHaveBeenCalledOnce();
    expect(loadDestinations).toHaveBeenCalledOnce();
    expect(reportUnavailable).not.toHaveBeenCalled();
    expect(view.homepage.whyChoose.map((item) => item.id)).toEqual(["fictional-value"]);
    expect(view.homepage.faqs.map((item) => item.id)).toEqual(["fictional-question"]);
    expect(view.information.map((entry) => entry.id)).toEqual([
      "manual-information",
      "homepage:why-choose-propeptiq",
      "homepage:faq:fictional-question",
    ]);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.homepage)).toBe(true);
    expect(Object.isFrozen(view.information)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/approvalNote|sourceReferences|reviewedAt|effectiveAt|kind/iu);
  });

  it("feeds approved Why Choose and FAQ destinations into the unchanged index and shared scorer", async () => {
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => [approvedWhy(), approvedFaq()],
      loadInformationRecords: () => [],
      loadDestinations: () => exactDestinations,
      reportUnavailable: vi.fn(),
    });

    const view = await getView();
    const index = buildStorefrontSearchIndex({
      products: [],
      information: view.information,
    });

    expect(index.entries.map(({ id, group, href }) => ({ id, group, href }))).toEqual([
      {
        id: "information:homepage:why-choose-propeptiq",
        group: "information",
        href: "/#why-choose-propeptiq",
      },
      {
        id: "information:homepage:faq:fictional-question",
        group: "information",
        href: "/#faq-fictional-question",
      },
    ]);
    for (const entry of index.entries) {
      expect(Object.keys(entry)).toEqual([
        "id",
        "group",
        "title",
        "href",
        "description",
        "exactTerms",
        "keywords",
        "popularityRank",
      ]);
    }
    expect(searchEntries(index.entries, "Fictional value")[0]?.entry.id).toBe(
      "information:homepage:why-choose-propeptiq",
    );
    expect(
      searchEntries(index.entries, "Fictional value body")[0]?.entry.id,
    ).toBe("information:homepage:why-choose-propeptiq");
    expect(
      searchEntries(index.entries, "Fictional question")[0]?.entry.id,
    ).toBe("information:homepage:faq:fictional-question");
    expect(searchEntries(index.entries, "Fictional answer")[0]?.entry.id).toBe(
      "information:homepage:faq:fictional-question",
    );
    expect(JSON.stringify(index)).not.toMatch(
      /sourceReferences|approvalNote|reviewedAt|effectiveAt|whyChoose|faqs/iu,
    );
  });

  it("omits draft and retired homepage records while retaining approved records", async () => {
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => [
        { ...approvedWhy("fictional-draft-value"), status: "draft" },
        { ...approvedFaq("fictional-retired-question"), status: "retired" },
        approvedWhy(),
        approvedFaq(),
      ],
      loadInformationRecords: () => [],
      loadDestinations: () => exactDestinations,
      reportUnavailable: vi.fn(),
    });

    const view = await getView();

    expect(view.homepage.whyChoose.map(({ id }) => id)).toEqual([
      "fictional-value",
    ]);
    expect(view.homepage.faqs.map(({ id }) => id)).toEqual([
      "fictional-question",
    ]);
    expect(JSON.stringify(view)).not.toMatch(/fictional-draft|fictional-retired/iu);
  });

  it.each([
    ["unsafe approved ID", [approvedWhy("Unsafe ID")]],
    [
      "duplicate approved homepage ID",
      [approvedWhy("fictional-duplicate"), approvedFaq("fictional-duplicate")],
    ],
  ])("fails the whole controlled projection closed for an %s", async (_label, records) => {
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => records,
      loadInformationRecords: () => [],
      loadDestinations: () => exactDestinations,
      reportUnavailable,
    });

    expect(await getView()).toEqual({
      homepage: { whyChoose: [], faqs: [] },
      information: [],
    });
    expect(reportUnavailable.mock.calls).toEqual([
      ["PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE"],
    ]);
  });

  it.each([
    ["duplicate ID", approvedInformation({ id: "homepage:why-choose-propeptiq" })],
    ["duplicate href", approvedInformation({ href: "/#why-choose-propeptiq" })],
  ])("fails the whole view closed for a %s across manual and derived information", async (_label, manual) => {
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => [approvedWhy()],
      loadInformationRecords: () => [manual],
      loadDestinations: () => exactDestinations,
      reportUnavailable,
    });

    const view = await getView();

    expect(view).toEqual({ homepage: { whyChoose: [], faqs: [] }, information: [] });
    expect(reportUnavailable.mock.calls).toEqual([
      ["PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE"],
    ]);
  });

  it("rejects duplicate manual information IDs or hrefs before returning any content", async () => {
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => [],
      loadInformationRecords: () => [
        approvedInformation(),
        approvedInformation({ id: "manual-information-two" }),
      ],
      loadDestinations: () => exactDestinations,
      reportUnavailable,
    });

    expect(await getView()).toEqual({
      homepage: { whyChoose: [], faqs: [] },
      information: [],
    });
    expect(reportUnavailable.mock.calls).toEqual([
      ["PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE"],
    ]);
  });

  it("reuses the same deeply frozen empty singleton for every infrastructure failure", async () => {
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => { throw new Error("private-fixture"); },
      reportUnavailable: () => undefined,
    });

    const first = await getView();
    const second = await getView();

    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.homepage)).toBe(true);
    expect(Object.isFrozen(first.information)).toBe(true);
  });

  it("treats missing approved anchors as content omission without infrastructure reporting", async () => {
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => [approvedWhy(), approvedFaq()],
      loadInformationRecords: () => [approvedInformation()],
      loadDestinations: () => [
        { path: "/", allowedAnchors: ["why-choose-propeptiq"] },
        { path: "/quality-records", allowedAnchors: [] },
      ],
      reportUnavailable,
    });

    const view = await getView();

    expect(view.homepage.whyChoose).toHaveLength(1);
    expect(view.homepage.faqs).toEqual([]);
    expect(view.information.map((entry) => entry.id)).toEqual([
      "manual-information",
      "homepage:why-choose-propeptiq",
    ]);
    expect(reportUnavailable).not.toHaveBeenCalled();
  });

  it.each([
    ["FAQ section anchor", ["faq-fictional-question"]],
    ["FAQ item anchor", ["faq"]],
  ])("omits FAQ content when the approved %s is missing", async (_label, allowedAnchors) => {
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => [approvedFaq()],
      loadInformationRecords: () => [],
      loadDestinations: () => [{ path: "/", allowedAnchors }],
      reportUnavailable,
    });

    const view = await getView();

    expect(view.homepage.faqs).toEqual([]);
    expect(view.information).toEqual([]);
    expect(reportUnavailable).not.toHaveBeenCalled();
  });

  it("uses only the fixed diagnostic when the default reporter handles a failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => { throw new Error("private-caught-fixture"); },
    });

    await getView();

    expect(warn.mock.calls).toEqual([
      ["PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE"],
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-caught-fixture");
    warn.mockRestore();
  });

  it.each([
    ["synchronous dependency failure", () => { throw new Error("private-sync-fixture"); }],
    ["rejected dependency failure", () => Promise.reject(new Error("private-reject-fixture"))],
  ])("returns the same frozen empty view and reports only the fixed diagnostic for %s", async (_label, failingLoader) => {
    const reportUnavailable = vi.fn();
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: failingLoader,
      loadInformationRecords: () => [],
      loadDestinations: () => exactDestinations,
      reportUnavailable,
    });

    const view = await getView();

    expect(view).toEqual({ homepage: { whyChoose: [], faqs: [] }, information: [] });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.homepage)).toBe(true);
    expect(Object.isFrozen(view.homepage.whyChoose)).toBe(true);
    expect(Object.isFrozen(view.homepage.faqs)).toBe(true);
    expect(Object.isFrozen(view.information)).toBe(true);
    expect(reportUnavailable.mock.calls).toEqual([
      ["PUBLIC_STOREFRONT_CONTENT_UNAVAILABLE"],
    ]);
    expect(JSON.stringify(reportUnavailable.mock.calls)).not.toMatch(/private-sync|private-reject/iu);
  });

  it("suppresses a throwing diagnostic reporter and never leaks the caught value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const privateFailure = new Error("private-provider-customer-fixture");
    const getView = createPublicStorefrontContentViewAccessor({
      loadControlledContent: () => { throw privateFailure; },
      reportUnavailable: () => { throw new Error("private-reporter-fixture"); },
    });

    await expect(getView()).resolves.toEqual({
      homepage: { whyChoose: [], faqs: [] },
      information: [],
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("projects the approved production homepage into the shared information index without reporting a failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const view = await getPublicStorefrontContentView();
    const index = buildStorefrontSearchIndex({
      products: [],
      information: view.information,
    });

    expect(view.homepage.whyChoose).toHaveLength(6);
    expect(view.homepage.faqs).toHaveLength(8);
    expect(view.information.map((entry) => entry.href)).toEqual([
      "/#why-choose-propeptiq",
      "/#faq-what-is-in-the-catalog",
      "/#faq-how-does-search-work",
      "/#faq-how-do-i-choose-a-configuration",
      "/#faq-how-do-quantity-discounts-work",
      "/#faq-does-the-cart-combine-configurations",
      "/#faq-what-does-pricing-coming-soon-mean",
      "/#faq-what-happens-before-checkout",
      "/#faq-where-are-research-use-restrictions",
    ]);
    expect(index.version).toBe(1);
    expect(index.entries).toHaveLength(9);
    expect(index.entries.every((entry) => entry.group === "information")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps dependency injection inside a server-only factory with no environment, database, or provider access", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/content/storefront-public-content-server.ts",
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/u);
    expect(source).not.toMatch(/process\.env|@\/env|@\/db|stripe|provider|set[A-Z].*Dependency|reset/iu);
  });
});
