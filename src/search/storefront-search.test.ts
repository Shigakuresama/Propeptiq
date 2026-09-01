import { describe, expect, it } from "vitest";
import {
  normalizeSearchText,
  searchEntries,
  sortStorefrontProducts,
  type SearchEntry,
  type StorefrontProductSortRow,
} from "./storefront-search";

function searchEntry(
  overrides: Partial<SearchEntry> & Pick<SearchEntry, "id" | "title">,
): SearchEntry {
  return {
    group: "products",
    href: `/catalog/items/${overrides.id}`,
    description: "",
    exactTerms: [],
    keywords: [],
    popularityRank: null,
    ...overrides,
  };
}

function sortRow(
  overrides: Partial<StorefrontProductSortRow> &
    Pick<StorefrontProductSortRow, "id" | "name">,
): StorefrontProductSortRow {
  return {
    popularityRank: null,
    releasedAt: null,
    price: { state: "unavailable" },
    ...overrides,
  };
}

describe("normalizeSearchText", () => {
  it.each([
    ["  Café—NAD+  ", "cafe nad"],
    ["PEPTIDE\t\n research", "peptide research"],
    ["alpha/beta©gamma", "alpha beta gamma"],
    ["Crème brûlée", "creme brulee"],
  ])("normalizes %j deterministically", (value, expected) => {
    expect(normalizeSearchText(value)).toBe(expected);
  });
});

describe("searchEntries", () => {
  it("returns a frozen empty result for an empty normalized query", () => {
    const result = searchEntries(
      [searchEntry({ id: "nad", title: "NAD" })],
      " \t— ",
    );

    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["exact product name", searchEntry({ id: "nad", title: "NAD+" }), "nad", 600],
    [
      "SKU",
      searchEntry({ id: "sku", title: "Catalog item", exactTerms: ["SKU-NAD-10"] }),
      "sku nad 10",
      600,
    ],
    [
      "alias",
      searchEntry({ id: "alias", title: "Nicotinamide", exactTerms: ["NAD Plus"] }),
      "nad plus",
      600,
    ],
    [
      "page title",
      searchEntry({
        id: "policy",
        group: "information",
        title: "Research Use Policy",
        href: "/research-use-policy",
      }),
      "research use policy",
      600,
    ],
    [
      "variant label",
      searchEntry({ id: "variant", title: "Example", exactTerms: ["10 mg"] }),
      "10 mg",
      600,
    ],
  ] as const)("scores an exact %s match at %i", (_label, entry, query, score) => {
    expect(searchEntries([entry], query)).toMatchObject([{ score }]);
  });

  it("scores title and core-token prefixes at 500", () => {
    const titlePrefix = searchEntry({ id: "title", title: "NAD research" });
    const tokenPrefix = searchEntry({ id: "token", title: "Advanced peptide library" });

    expect(searchEntries([titlePrefix], "nad res")[0]?.score).toBe(500);
    expect(searchEntries([tokenPrefix], "pept")[0]?.score).toBe(500);
  });

  it("scores complete multi-token core matches at 400 regardless of token order", () => {
    const entry = searchEntry({
      id: "multi",
      title: "Research laboratory peptide",
    });

    expect(searchEntries([entry], "laboratory research")[0]?.score).toBe(400);
  });

  it("scores a full core-field substring at 300", () => {
    const entry = searchEntry({
      id: "substring",
      title: "Advanced research platform",
    });

    expect(searchEntries([entry], "search plat")[0]?.score).toBe(300);
  });

  it("scores keyword and approved-description metadata matches at 200", () => {
    const keyword = searchEntry({
      id: "keyword",
      title: "First item",
      keywords: ["Laboratory supply collection"],
    });
    const description = searchEntry({
      id: "description",
      title: "Second item",
      description: "Approved reference material overview",
    });
    const spannedTokens = searchEntry({
      id: "spanned",
      title: "Third item",
      keywords: ["alpha"],
      description: "beta",
    });

    expect(searchEntries([keyword], "supply collect")[0]?.score).toBe(200);
    expect(searchEntries([description], "reference material")[0]?.score).toBe(200);
    expect(searchEntries([spannedTokens], "alpha beta")[0]?.score).toBe(200);
  });

  it("does not manufacture a full metadata substring across separate fields", () => {
    const entry = searchEntry({
      id: "metadata-fields",
      title: "Unrelated",
      keywords: ["alpha"],
      description: "beta",
    });

    expect(searchEntries([entry], "alpha be")).toEqual([]);
  });

  it("accepts bounded fuzzy matches and returns their exact computed scores", () => {
    const short = searchEntry({ id: "short", title: "Catalog" });
    const long = searchEntry({ id: "long", title: "Research" });

    expect(searchEntries([short], "catalgg")[0]?.score).toBe(99);
    expect(searchEntries([long], "reeserch")[0]?.score).toBe(98);
  });

  it("allows distance two only for query tokens at least eight characters", () => {
    const short = searchEntry({ id: "short", title: "Catalog" });
    const long = searchEntry({ id: "long", title: "Research" });

    expect(searchEntries([short], "catxloz")).toEqual([]);
    expect(searchEntries([long], "reeserch")[0]?.score).toBe(98);
  });

  it.each([
    ["a", "b"],
    ["na", "nx"],
    ["nad", "nax"],
  ])(
    "does not use fuzzy matching for the short query %j",
    (query, candidate) => {
      expect(
        searchEntries([searchEntry({ id: "short-query", title: candidate })], query),
      ).toEqual([]);
    },
  );

  it("uses the single maximum applicable score instead of stacking branches", () => {
    const entry = searchEntry({
      id: "maximum",
      title: "NAD research",
      exactTerms: ["NAD"],
      keywords: ["NAD"],
    });

    expect(searchEntries([entry], "nad")).toEqual([{ entry, score: 600 }]);
  });

  it("sorts ties by finite popularity, normalized title, and stable ID", () => {
    const entries = [
      searchEntry({ id: "z", title: "Beta", exactTerms: ["target"], popularityRank: null }),
      searchEntry({ id: "b", title: "Álpha", exactTerms: ["target"], popularityRank: 2 }),
      searchEntry({ id: "a", title: "Alpha", exactTerms: ["target"], popularityRank: 2 }),
      searchEntry({ id: "nan", title: "Able", exactTerms: ["target"], popularityRank: Number.NaN }),
      searchEntry({ id: "first", title: "Zulu", exactTerms: ["target"], popularityRank: -1 }),
    ];

    expect(searchEntries(entries, "target").map(({ entry }) => entry.id)).toEqual([
      "first",
      "a",
      "b",
      "nan",
      "z",
    ]);
  });

  it("rejects blank and duplicate IDs before matching", () => {
    expect(() =>
      searchEntries([searchEntry({ id: "\u00a0", title: "Blank" })], "blank"),
    ).toThrow(TypeError);
    expect(() =>
      searchEntries(
        [
          searchEntry({ id: "duplicate", title: "First" }),
          searchEntry({ id: "duplicate", title: "Second" }),
        ],
        "missing",
      ),
    ).toThrow(TypeError);
  });

  it("does not mutate or freeze caller-owned entries and returns frozen wrappers", () => {
    const exactTerms = ["Alias"];
    const keywords = ["Category"];
    const entry = searchEntry({
      id: "immutable",
      title: "Immutable",
      exactTerms,
      keywords,
    });
    const entries = [entry];
    const before = structuredClone(entries);

    const result = searchEntries(entries, "alias");

    expect(entries).toEqual(before);
    expect(exactTerms).toEqual(["Alias"]);
    expect(keywords).toEqual(["Category"]);
    expect(Object.isFrozen(entry)).toBe(false);
    expect(Object.isFrozen(exactTerms)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(result[0]?.entry).toBe(entry);
  });

  it("disables only fuzzy work for overlong and over-tokenized queries", () => {
    const longQuery = "a".repeat(129);
    const longCandidate = `${"a".repeat(128)}b`;
    const nineQueryTokens = [
      "aaaaa",
      "bbbbb",
      "ccccc",
      "ddddd",
      "eeeee",
      "fffff",
      "ggggg",
      "hhhhh",
      "iiiii",
    ];
    const nineCandidateTokens = nineQueryTokens.map((token) => `${token.slice(0, -1)}x`);

    expect(
      searchEntries(
        [searchEntry({ id: "long-fuzzy", title: longCandidate })],
        longQuery,
      ),
    ).toEqual([]);
    expect(
      searchEntries(
        [searchEntry({ id: "many-fuzzy", title: nineCandidateTokens.join(" ") })],
        nineQueryTokens.join(" "),
      ),
    ).toEqual([]);
    expect(
      searchEntries([searchEntry({ id: "long-exact", title: longQuery })], longQuery)[0]
        ?.score,
    ).toBe(600);
  });

  it("rejects fuzzy-only overlong tokens and candidates beyond the sorted 64-token cap", () => {
    const overlongQuery = `${"q".repeat(64)}x`;
    const overlongCandidate = `${"q".repeat(64)}y`;
    const cappedCorpus = [
      ...Array.from({ length: 64 }, (_, index) => `a${index.toString().padStart(3, "0")}`),
      "zzzzb",
    ];

    expect(
      searchEntries(
        [searchEntry({ id: "overlong", title: overlongCandidate })],
        overlongQuery,
      ),
    ).toEqual([]);
    expect(
      searchEntries(
        [searchEntry({ id: "capped", title: cappedCorpus.join(" ") })],
        "zzzza",
      ),
    ).toEqual([]);
  });

  it("uses a code-unit fallback when collation-equivalent corpus tokens meet the cap", () => {
    const earlierTokens = Array.from(
      { length: 63 },
      (_, index) => `a${index.toString().padStart(3, "0")}`,
    );
    const entry = searchEntry({
      id: "collation-cap",
      title: ["œabc", ...earlierTokens, "oeabc"].join(" "),
    });

    expect(searchEntries([entry], "oeabx")[0]?.score).toBe(99);
  });
});

describe("sortStorefrontProducts", () => {
  it("sorts all five modes with deterministic name and ID fallbacks", () => {
    const rows = [
      sortRow({
        id: "beta",
        name: "Beta",
        popularityRank: 2,
        releasedAt: "2026-01-01T00:00:00Z",
        price: { state: "active", effectiveMinor: 200 },
      }),
      sortRow({
        id: "alpha-b",
        name: "Álpha",
        popularityRank: 1,
        releasedAt: "2026-02-01T00:00:00Z",
        price: { state: "active", effectiveMinor: 100 },
      }),
      sortRow({
        id: "alpha-a",
        name: "Alpha",
        popularityRank: null,
        releasedAt: null,
        price: { state: "pending" },
      }),
    ];

    expect(sortStorefrontProducts(rows, "popular").map(({ id }) => id)).toEqual([
      "alpha-b",
      "beta",
      "alpha-a",
    ]);
    expect(sortStorefrontProducts(rows, "price-asc").map(({ id }) => id)).toEqual([
      "alpha-b",
      "beta",
      "alpha-a",
    ]);
    expect(sortStorefrontProducts(rows, "price-desc").map(({ id }) => id)).toEqual([
      "beta",
      "alpha-b",
      "alpha-a",
    ]);
    expect(sortStorefrontProducts(rows, "alphabetical").map(({ id }) => id)).toEqual([
      "alpha-a",
      "alpha-b",
      "beta",
    ]);
    expect(sortStorefrontProducts(rows, "newest").map(({ id }) => id)).toEqual([
      "alpha-b",
      "beta",
      "alpha-a",
    ]);
  });

  it("puts only finite positive popularity ranks first", () => {
    const rows = [
      sortRow({ id: "two", name: "Zulu", popularityRank: 2 }),
      sortRow({ id: "one", name: "Zulu", popularityRank: 1 }),
      sortRow({ id: "zero", name: "Able", popularityRank: 0 }),
      sortRow({ id: "negative", name: "Beta", popularityRank: -1 }),
      sortRow({ id: "nan", name: "Charlie", popularityRank: Number.NaN }),
      sortRow({ id: "infinity", name: "Delta", popularityRank: Number.POSITIVE_INFINITY }),
      sortRow({ id: "null", name: "Echo", popularityRank: null }),
    ];

    expect(sortStorefrontProducts(rows, "popular").map(({ id }) => id)).toEqual([
      "one",
      "two",
      "zero",
      "negative",
      "nan",
      "infinity",
      "null",
    ]);
  });

  it("orders active, pending, and unavailable prices in both directions", () => {
    const rows = [
      sortRow({ id: "active-high", name: "High", price: { state: "active", effectiveMinor: 300 } }),
      sortRow({ id: "active-low-b", name: "Álpha", price: { state: "active", effectiveMinor: 100 } }),
      sortRow({ id: "active-low-a", name: "Alpha", price: { state: "active", effectiveMinor: 100 } }),
      sortRow({ id: "pending", name: "Pending", price: { state: "pending" } }),
      sortRow({ id: "unavailable", name: "Unavailable", price: { state: "unavailable" } }),
    ];

    expect(sortStorefrontProducts(rows, "price-asc").map(({ id }) => id)).toEqual([
      "active-low-a",
      "active-low-b",
      "active-high",
      "pending",
      "unavailable",
    ]);
    expect(sortStorefrontProducts(rows, "price-desc").map(({ id }) => id)).toEqual([
      "active-high",
      "active-low-a",
      "active-low-b",
      "pending",
      "unavailable",
    ]);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("fails malformed active price %j into the unavailable bucket", (effectiveMinor) => {
    const malformed = sortRow({
      id: "malformed",
      name: "Able",
      price: { state: "active", effectiveMinor },
    });
    const pending = sortRow({ id: "pending", name: "Pending", price: { state: "pending" } });
    const unavailable = sortRow({ id: "unavailable", name: "Zulu", price: { state: "unavailable" } });

    expect(
      sortStorefrontProducts([malformed, pending, unavailable], "price-asc").map(
        ({ id }) => id,
      ),
    ).toEqual(["pending", "malformed", "unavailable"]);
  });

  it("sorts strict explicit-offset timestamps by instant, including nanosecond fractions", () => {
    const rows = [
      sortRow({ id: "older", name: "Older", releasedAt: "2026-01-01T00:00:00.123456789Z" }),
      sortRow({ id: "newer", name: "Newer", releasedAt: "2026-01-01T00:00:00.123456790Z" }),
      sortRow({ id: "offset-b", name: "Beta", releasedAt: "2025-12-31T16:00:00-08:00" }),
      sortRow({ id: "offset-a", name: "Alpha", releasedAt: "2026-01-01T00:00:00Z" }),
    ];

    expect(sortStorefrontProducts(rows, "newest").map(({ id }) => id)).toEqual([
      "newer",
      "older",
      "offset-a",
      "offset-b",
    ]);
  });

  it.each([
    "2026-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+14:01",
    "2026-01-01T00:00:00+15:00",
    "2026-01-01T00:00:00+00:60",
    "2026-01-01T00:00:00",
    "January 1, 2026",
  ])("places invalid timestamp %j after valid timestamps", (releasedAt) => {
    const invalid = sortRow({ id: "invalid", name: "Able", releasedAt });
    const valid = sortRow({
      id: "valid",
      name: "Zulu",
      releasedAt: "2024-02-29T23:59:59.123456789+14:00",
    });

    expect(sortStorefrontProducts([invalid, valid], "newest").map(({ id }) => id)).toEqual([
      "valid",
      "invalid",
    ]);
  });

  it("rejects blank and duplicate product IDs", () => {
    expect(() =>
      sortStorefrontProducts([sortRow({ id: " ", name: "Blank" })], "alphabetical"),
    ).toThrow(TypeError);
    expect(() =>
      sortStorefrontProducts(
        [
          sortRow({ id: "same", name: "First" }),
          sortRow({ id: "same", name: "Second" }),
        ],
        "alphabetical",
      ),
    ).toThrow(TypeError);
  });

  it("returns a frozen copy without mutating or freezing caller rows", () => {
    const first = sortRow({ id: "first", name: "Zulu" });
    const second = sortRow({ id: "second", name: "Alpha" });
    const rows = [first, second];
    const before = structuredClone(rows);

    const sorted = sortStorefrontProducts(rows, "alphabetical");

    expect(rows).toEqual(before);
    expect(sorted.map(({ id }) => id)).toEqual(["second", "first"]);
    expect(sorted).not.toBe(rows);
    expect(Object.isFrozen(sorted)).toBe(true);
    expect(Object.isFrozen(first)).toBe(false);
    expect(Object.isFrozen(second)).toBe(false);
    expect(sorted[0]).toBe(second);
  });
});
