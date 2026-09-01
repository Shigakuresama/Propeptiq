import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { SearchEntry } from "@/search/storefront-search";
import type { StorefrontSearchIndex } from "@/search/storefront-index";

vi.mock("@/content/public-information", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/content/public-information")
  >();
  return {
    ...actual,
    // Production currently approves no anchors. This fictional test-only seam
    // proves fragment approval delegates to the exported browser-safe policy.
    isApprovedPublicInformationHref: (value: unknown) =>
      value === "/quality-records#synthetic-approved" ||
      actual.isApprovedPublicInformationHref(value),
  };
});

import { SiteSearchLauncher } from "./site-search-launcher";

const PROMPT = "Type to search products and information.";
const TEMPORARY_UNAVAILABLE =
  "Search is temporarily unavailable. Please try again.";
const globalsCss = readFileSync(
  path.resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
).replace(/\r\n?/gu, "\n");
const siteHeaderSource = readFileSync(
  path.resolve(process.cwd(), "src/components/site/site-header.tsx"),
  "utf8",
);

function cssRuleBody(
  source: string,
  selector: string,
  startAt = 0,
): string {
  const ruleStart = source.indexOf(`${selector} {`, startAt);
  expect(ruleStart, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf("{", ruleStart) + 1;
  const bodyEnd = source.indexOf("}", bodyStart);
  expect(bodyEnd, `unterminated CSS rule: ${selector}`).toBeGreaterThan(bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

function cssDeclarations(ruleBody: string): ReadonlyMap<string, string> {
  return new Map(
    ruleBody
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        expect(separator, `invalid CSS declaration: ${declaration}`).toBeGreaterThan(0);
        return [
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        ];
      }),
  );
}

function syntheticProduct(overrides: Partial<SearchEntry> = {}): SearchEntry {
  return {
    id: "product:synthetic-alpha",
    group: "products",
    title: "Synthetic Alpha Product",
    href: "/catalog/items/synthetic-alpha",
    description: "Synthetic approved product description.",
    exactTerms: ["SYN-ALPHA", "synthetic-alpha"],
    keywords: ["Synthetic category"],
    popularityRank: 2,
    ...overrides,
  };
}

function syntheticInformation(overrides: Partial<SearchEntry> = {}): SearchEntry {
  return {
    id: "information:synthetic-quality",
    group: "information",
    title: "Synthetic Quality Records",
    href: "/quality-records",
    description: "Synthetic approved information description.",
    exactTerms: [],
    keywords: ["Synthetic records"],
    popularityRank: null,
    ...overrides,
  };
}

function syntheticIndex(
  entries: readonly SearchEntry[] = [],
): StorefrontSearchIndex {
  return { version: 1, entries };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function openInjected(index: StorefrontSearchIndex = syntheticIndex()) {
  const user = userEvent.setup();
  const loadIndex = vi.fn(async () => index);
  render(<SiteSearchLauncher loadIndex={loadIndex} />);
  const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Search PropeptIQ" });
  await within(dialog).findByText(PROMPT);
  return { user, loadIndex, trigger, dialog };
}

function expectSingleStatus(dialog: HTMLElement, text: string | RegExp): void {
  const statuses = within(dialog).getAllByRole("status");
  expect(statuses).toHaveLength(1);
  expect(statuses[0]).toHaveAttribute("aria-live", "polite");
  expect(statuses[0]).toHaveAttribute("aria-atomic", "true");
  expect(statuses[0]).toHaveTextContent(text);
}

describe("SiteSearchLauncher loading and validation", () => {
  it("does not load the fictional test index until the permanent launcher opens", async () => {
    const user = userEvent.setup();
    const loadIndex = vi.fn(async () => syntheticIndex());

    render(<SiteSearchLauncher loadIndex={loadIndex} />);

    expect(loadIndex).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    expect(loadIndex).toHaveBeenCalledOnce();
  });

  it("uses the exact query-free default request and clears only failed cache for explicit Retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider: "sensitive" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("not json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }))
      .mockResolvedValueOnce(new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 2, entries: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(syntheticIndex()), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<SiteSearchLauncher />);
      const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
      await user.click(trigger);
      const dialog = screen.getByRole("dialog");
      await within(dialog).findByText(TEMPORARY_UNAVAILABLE);
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/storefront-search", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      expect(dialog).not.toHaveTextContent(/sensitive|provider|503/iu);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => Promise.resolve());
      expect(fetchMock).toHaveBeenCalledTimes(1);

      for (const callCount of [2, 3, 4, 5]) {
        await user.click(within(dialog).getByRole("button", { name: "Retry" }));
        if (callCount < 5) await within(dialog).findByText(TEMPORARY_UNAVAILABLE);
        else await within(dialog).findByText(PROMPT);
        expect(fetchMock).toHaveBeenCalledTimes(callCount);
      }

      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await user.click(trigger);
      await screen.findByText(PROMPT);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["non-object wrapper", null],
    ["array wrapper", []],
    ["extra wrapper key", { ...syntheticIndex(), extra: true }],
    ["wrong version", { version: 2, entries: [] }],
    ["non-array entries", { version: 1, entries: {} }],
    ["sparse entries", { version: 1, entries: new Array(1) }],
    [
      "extended entries array",
      {
        version: 1,
        entries: Object.assign([syntheticProduct()], {
          providerAuthority: "synthetic-sensitive-detail",
        }),
      },
    ],
    ["extra entry key", syntheticIndex([{ ...syntheticProduct(), extra: true } as unknown as SearchEntry])],
    ["wrong group", syntheticIndex([syntheticProduct({ group: "catalog" as "products" })])],
    ["blank id", syntheticIndex([syntheticProduct({ id: "   " })])],
    ["blank title", syntheticIndex([syntheticProduct({ title: "" })])],
    ["object description", syntheticIndex([syntheticProduct({ description: {} as string })])],
    ["non-array terms", syntheticIndex([syntheticProduct({ exactTerms: "SYN" as unknown as string[] })])],
    ["blank keyword", syntheticIndex([syntheticProduct({ keywords: [" "] })])],
    ["sparse terms", syntheticIndex([syntheticProduct({ exactTerms: new Array(1) })])],
    ["zero rank", syntheticIndex([syntheticProduct({ popularityRank: 0 })])],
    ["negative rank", syntheticIndex([syntheticProduct({ popularityRank: -1 })])],
    ["infinite rank", syntheticIndex([syntheticProduct({ popularityRank: Number.POSITIVE_INFINITY })])],
    ["duplicate IDs", syntheticIndex([syntheticProduct(), syntheticInformation({ id: "product:synthetic-alpha" })])],
    ["unapproved information href", syntheticIndex([syntheticInformation({ href: "/admin" })])],
    ["malformed fragment", syntheticIndex([syntheticInformation({ href: "/quality-records#bad#fragment" })])],
  ] as const)("contains malformed injected payload: %s", async (_label, payload) => {
    const user = userEvent.setup();
    render(
      <SiteSearchLauncher
        loadIndex={async () => payload as StorefrontSearchIndex}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText(TEMPORARY_UNAVAILABLE);
    expectSingleStatus(dialog, TEMPORARY_UNAVAILABLE);
    expect(dialog).not.toHaveTextContent(/malformed|catalog|admin|fragment/iu);
  });

  it.each([
    "https://example.test/catalog/items/synthetic-alpha",
    "//example.test/catalog/items/synthetic-alpha",
    "/catalog/items/synthetic-alpha?query=leak",
    "/catalog/items/synthetic-alpha%20",
    "/catalog/items/synthetic alpha",
    "/catalog/items/synthetic-alpha\\escape",
    "/catalog/items/Synthetic-Alpha",
    "/catalog/items/synthetic-alpha#fragment",
  ])("rejects unsafe product href %s", async (href) => {
    const user = userEvent.setup();
    render(
      <SiteSearchLauncher
        loadIndex={async () => syntheticIndex([syntheticProduct({ href })])}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    await screen.findByText(TEMPORARY_UNAVAILABLE);
  });

  it("contains synchronous throws and rejections behind the same fixed error", async () => {
    const user = userEvent.setup();
    const synchronous = vi.fn((): Promise<StorefrontSearchIndex> => {
      throw new Error("synchronous-sensitive-detail");
    });
    const first = render(<SiteSearchLauncher loadIndex={synchronous} />);
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    expect(await screen.findByText(TEMPORARY_UNAVAILABLE)).toBeVisible();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("synchronous-sensitive-detail");
    first.unmount();

    render(
      <SiteSearchLauncher
        loadIndex={() => Promise.reject(new Error("rejected-sensitive-detail"))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    expect(await screen.findByText(TEMPORARY_UNAVAILABLE)).toBeVisible();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("rejected-sensitive-detail");
  });

  it("clones successful data before caching instead of retaining caller-owned records", async () => {
    const mutableEntry = syntheticProduct() as SearchEntry & {
      title: string;
      href: string;
      exactTerms: string[];
    };
    const payload = syntheticIndex([mutableEntry]);
    const { user, dialog } = await openInjected(payload);
    mutableEntry.title = "Mutated caller title";
    mutableEntry.href = "/catalog/items/mutated-caller";
    mutableEntry.exactTerms.push("mutated-caller-term");

    await user.type(within(dialog).getByRole("searchbox"), "SYN-ALPHA");
    const link = within(dialog).getByRole("link", { name: /Synthetic Alpha Product/iu });
    expect(link).toHaveAttribute("href", "/catalog/items/synthetic-alpha");
    expect(dialog).not.toHaveTextContent("Mutated caller title");
  });

  it("isolates injected caches per instance and resets when loader identity changes", async () => {
    const user = userEvent.setup();
    const sharedLoader = vi.fn(async () => syntheticIndex());
    const first = render(<SiteSearchLauncher loadIndex={sharedLoader} />);
    const second = render(<SiteSearchLauncher loadIndex={sharedLoader} />);
    const triggers = screen.getAllByRole("button", { name: "Search PropeptIQ" });
    await user.click(triggers[0]!);
    await screen.findByText(PROMPT);
    await user.keyboard("{Escape}");
    await user.click(triggers[1]!);
    await screen.findByText(PROMPT);
    expect(sharedLoader).toHaveBeenCalledTimes(2);
    second.unmount();

    const replacement = vi.fn(async () => syntheticIndex());
    first.rerender(<SiteSearchLauncher loadIndex={replacement} />);
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    await screen.findByText(PROMPT);
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("shows Retry only after error, never retries automatically, and starts one explicit retry", async () => {
    const user = userEvent.setup();
    const loadIndex = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(syntheticIndex());
    render(<SiteSearchLauncher loadIndex={loadIndex} />);
    await user.click(screen.getByRole("button", { name: "Search PropeptIQ" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("button", { name: "Retry" })).toBeVisible();
    expect(loadIndex).toHaveBeenCalledOnce();
    await act(async () => Promise.resolve());
    expect(loadIndex).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await within(dialog).findByText(PROMPT);
    expect(loadIndex).toHaveBeenCalledTimes(2);
  });

  it("keeps a pending success cached after Escape without reopening", async () => {
    const user = userEvent.setup();
    const pending = deferred<StorefrontSearchIndex>();
    const loadIndex = vi.fn(() => pending.promise);
    render(<SiteSearchLauncher loadIndex={loadIndex} />);
    const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
    await user.click(trigger);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading search/iu);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => {
      pending.resolve(syntheticIndex());
      await pending.promise;
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    await screen.findByText(PROMPT);
    expect(loadIndex).toHaveBeenCalledOnce();
  });

  it("contains a pending rejection after Escape and reloads only on reopen", async () => {
    const user = userEvent.setup();
    const pending = deferred<StorefrontSearchIndex>();
    const loadIndex = vi.fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(syntheticIndex());
    render(<SiteSearchLauncher loadIndex={loadIndex} />);
    const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await act(async () => {
      pending.reject(new Error("late-sensitive-detail"));
      try { await pending.promise; } catch { /* component contains it */ }
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadIndex).toHaveBeenCalledOnce();
    await user.click(trigger);
    await screen.findByText(PROMPT);
    expect(loadIndex).toHaveBeenCalledTimes(2);
  });
});

describe("SiteSearchLauncher accessible Sheet behavior", () => {
  it("does not mask public descendant overflow with hidden or clipped overflow", () => {
    const publicLayout = cssDeclarations(
      cssRuleBody(globalsCss, ".public-layout"),
    );
    expect(["hidden", "clip"]).not.toContain(publicLayout.get("overflow"));
    expect(["hidden", "clip"]).not.toContain(publicLayout.get("overflow-x"));
  });

  it("keeps footer reservation public-only and preserves the exact safe-area token", () => {
    const root = cssDeclarations(cssRuleBody(globalsCss, ":root"));
    expect(root.get("--site-search-reserved-height")).toBe("4.5rem");

    const footer = cssDeclarations(
      cssRuleBody(globalsCss, ".public-layout > footer"),
    );
    expect(footer.get("padding-bottom")).toBe(
      "calc(var(--site-search-reserved-height) + env(safe-area-inset-bottom, 0px))",
    );

    for (const selector of ["body", "main", "footer"]) {
      const bareRule = new RegExp(
        `(?:^|\\})\\s*${selector}\\s*\\{([^}]*)\\}`,
        "gu",
      );
      for (const match of globalsCss.matchAll(bareRule)) {
        expect(match[1], `${selector} must not own launcher reservation`)
          .not.toMatch(/padding(?:-bottom)?\s*:/u);
      }
    }
  });

  it("keeps the launcher in a centered nonblocking safe-area lane", () => {
    const lane = cssDeclarations(
      cssRuleBody(globalsCss, ".site-search-launcher-lane"),
    );
    expect(lane.get("position")).toBe("fixed");
    expect(lane.get("left")).toBe("50%");
    expect(lane.get("transform")).toBe("translateX(-50%)");
    expect(lane.get("bottom")).toBe(
      "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
    );
    expect(lane.get("width")).toBe("min(24rem, calc(100vw - 1rem))");
    expect(lane.get("max-width")).toBe("calc(100vw - 1rem)");
    expect(lane.get("z-index")).toBe("30");
    expect(lane.get("pointer-events")).toBe("none");
    expect(lane.get("justify-content")).toBe("center");

    const trigger = cssDeclarations(cssRuleBody(
      globalsCss,
      '.site-search-launcher-lane > [data-slot="sheet-trigger"]',
    ));
    expect(trigger.get("min-width")).toBe("44px");
    expect(trigger.get("min-height")).toBe("44px");
    expect(trigger.get("max-width")).toBe("100%");
    expect(trigger.get("pointer-events")).toBe("auto");
  });

  it("gives the bottom search Sheet capped desktop geometry and one results scroller", () => {
    const sheetSelector = '.site-search-sheet[data-side="bottom"]';
    const sheet = cssDeclarations(cssRuleBody(globalsCss, sheetSelector));
    expect(sheet.get("width")).toBe("min(36rem, calc(100vw - 2rem))");
    expect(sheet.get("height")).toBe("min(42rem, calc(100dvh - 2rem))");
    expect(sheet.get("max-height")).toBe("min(42rem, calc(100dvh - 2rem))");
    expect(sheet.get("overflow")).toBe("hidden");

    const results = cssDeclarations(cssRuleBody(
      globalsCss,
      `${sheetSelector} > .site-search-results`,
    ));
    expect(results.get("flex")).toBe("1 1 0%");
    expect(results.get("min-height")).toBe("0");
    expect(results.get("overflow-y")).toBe("auto");
    expect(results.get("overscroll-behavior")).toBe("contain");

    const phoneMedia = globalsCss.indexOf("@media (max-width: 47.999rem)");
    expect(phoneMedia).toBeGreaterThanOrEqual(0);
    const phoneSheet = cssDeclarations(
      cssRuleBody(globalsCss, sheetSelector, phoneMedia),
    );
    expect(phoneSheet.get("inset-inline")).toBe("0");
    expect(phoneSheet.get("bottom")).toBe("0");
    expect(phoneSheet.get("width")).toBe("100%");
    expect(phoneSheet.get("max-width")).toBe("100%");
    expect(phoneSheet.get("height")).toBe("100dvh");
    expect(phoneSheet.get("max-height")).toBe("100dvh");
    expect(phoneSheet.get("border-radius")).toBe("0");
    expect(phoneSheet.get("overscroll-behavior")).toBe("contain");
    expect(phoneSheet.get("padding-bottom")).toBe(
      "env(safe-area-inset-bottom, 0px)",
    );
    expect(phoneSheet.get("height")).not.toBe("100vh");
  });

  it("leaves the generic mobile Sheet untouched and retains authoritative reduced motion", () => {
    expect(siteHeaderSource).toContain('side="right"');
    expect(siteHeaderSource).toContain(
      'className="w-[min(24rem,calc(100vw-1rem))] border-border bg-canvas p-0"',
    );
    expect(globalsCss).not.toMatch(
      /\[data-slot=["']?sheet-content["']?\]\s*\{/u,
    );

    const reducedMedia = globalsCss.indexOf(
      "@media (prefers-reduced-motion: reduce)",
    );
    expect(reducedMedia).toBeGreaterThanOrEqual(0);
    const reducedSource = globalsCss.slice(reducedMedia);
    expect(cssDeclarations(cssRuleBody(reducedSource, "html")).get("scroll-behavior"))
      .toBe("auto");
    const universalMotion = cssDeclarations(cssRuleBody(
      reducedSource,
      "*,\n  *::before,\n  *::after",
    ));
    expect(universalMotion.get("scroll-behavior")).toBe("auto !important");
    expect(universalMotion.get("transition-duration")).toBe("0s !important");
    expect(universalMotion.get("animation-duration")).toBe("0s !important");
  });

  it("uses one bottom Sheet, stable owners, one live status, and no empty-query dump", async () => {
    const { dialog, trigger } = await openInjected();

    expect(trigger.parentElement).toHaveClass("site-search-launcher-lane");
    expect(trigger).toHaveClass("min-h-11");
    expect(dialog).toHaveClass("site-search-sheet");
    expect(dialog).toHaveAttribute("data-side", "bottom");
    const searchbox = within(dialog).getByRole("searchbox", {
      name: "Search products and information",
    });
    const results = dialog.querySelector(".site-search-results");
    expect(results).not.toBeNull();
    expect(results?.parentElement).toBe(dialog);
    expect(results).toHaveAttribute("id");
    expect(searchbox).toHaveAttribute("aria-controls", results?.id);
    expect(searchbox).not.toHaveAttribute("aria-activedescendant");
    expect(results).toBeEmptyDOMElement();
    expectSingleStatus(dialog, PROMPT);
  });

  it("uses real searchEntries and preserves score order inside product-first groups", async () => {
    const index = syntheticIndex([
      syntheticInformation({
        title: "Synthetic",
        description: "Exact synthetic information copy.",
      }),
      syntheticProduct({
        id: "product:synthetic-alpha",
        title: "Synthetic Alpha Product",
        popularityRank: 2,
      }),
      syntheticProduct({
        id: "product:synthetic-beta",
        title: "Synthetic Beta Product",
        href: "/catalog/items/synthetic-beta",
        popularityRank: 1,
      }),
    ]);
    const { user, dialog } = await openInjected(index);
    const input = within(dialog).getByRole("searchbox");
    await user.type(input, "synthetic");

    const results = dialog.querySelector<HTMLElement>(".site-search-results")!;
    expect(within(results).getByRole("heading", { name: "Products" })).toBeVisible();
    expect(
      within(results).getByRole("heading", { name: "Pages or Information" }),
    ).toBeVisible();
    const links = within(results).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/catalog/items/synthetic-beta",
      "/catalog/items/synthetic-alpha",
      "/quality-records",
    ]);
    expect(links[0]).toHaveTextContent("Synthetic Beta Product");
    expect(links[1]).toHaveTextContent("Synthetic Alpha Product");
    expect(links[2]).toHaveTextContent("Exact synthetic information copy.");
    expectSingleStatus(dialog, "3 results found.");
    expect(dialog).not.toHaveTextContent(/dosage|administration|treatment|provider|cart/iu);

    await user.clear(input);
    await user.type(input, "synthetci");
    expect(within(results).getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual([
        "/catalog/items/synthetic-beta",
        "/catalog/items/synthetic-alpha",
        "/quality-records",
      ]);
  });

  it("renders an approved fictional fragment unchanged and an honest no-results state", async () => {
    const { user, dialog } = await openInjected(syntheticIndex([
      syntheticInformation({
        id: "information:synthetic-fragment",
        title: "Synthetic Fragment Page",
        href: "/quality-records#synthetic-approved",
      }),
    ]));
    const input = within(dialog).getByRole("searchbox");
    await user.type(input, "fragment");
    expect(within(dialog).getByRole("link", { name: /Synthetic Fragment Page/iu }))
      .toHaveAttribute("href", "/quality-records#synthetic-approved");

    await user.clear(input);
    await user.type(input, "definitely absent query");
    expectSingleStatus(dialog, "No results found.");
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("cycles displayed results with deterministic IDs and resets active state on query change", async () => {
    const { user, dialog } = await openInjected(syntheticIndex([
      syntheticProduct(),
      syntheticInformation(),
    ]));
    const input = within(dialog).getByRole("searchbox");
    await user.type(input, "synthetic");
    const links = within(dialog.querySelector(".site-search-results")!)
      .getAllByRole("link");

    expect(input).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", links[0]!.id);
    expect(document.getElementById(links[0]!.id)).toBe(links[0]);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      links[links.length - 1]!.id,
    );
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", links[1]!.id);

    await user.type(input, " alpha");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("activates the exact selected anchor on Enter and closes before navigation", async () => {
    const { user, dialog } = await openInjected(syntheticIndex([syntheticProduct()]));
    const input = within(dialog).getByRole("searchbox");
    let activatedHref: string | null = null;
    const captureNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      activatedHref = anchor.getAttribute("href");
      event.preventDefault();
    };
    window.addEventListener("click", captureNavigation);
    try {
      await user.type(input, "SYN-ALPHA");
      await user.keyboard("{ArrowDown}{Enter}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(activatedHref).toBe("/catalog/items/synthetic-alpha");
    } finally {
      window.removeEventListener("click", captureNavigation);
    }
  });

  it("closes on pointer selection and restores trigger focus", async () => {
    const { user, dialog, trigger } = await openInjected(
      syntheticIndex([syntheticInformation()]),
    );
    await user.type(within(dialog).getByRole("searchbox"), "quality");
    const link = within(dialog).getByRole("link", {
      name: /Synthetic Quality Records/iu,
    });
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("click", preventNavigation);
    try {
      await user.click(link);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger).toHaveFocus();
    } finally {
      window.removeEventListener("click", preventNavigation);
    }
  });

  it("delegates Escape and Tab to Radix, restores focus, and resets query and active state", async () => {
    const { user, dialog, trigger } = await openInjected(
      syntheticIndex([syntheticProduct(), syntheticInformation()]),
    );
    const input = within(dialog).getByRole("searchbox");
    await user.type(input, "synthetic");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant");

    for (let index = 0; index < 5; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    input.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const reopened = screen.getByRole("dialog");
    const reopenedInput = within(reopened).getByRole("searchbox");
    await within(reopened).findByText(PROMPT);
    expect(reopenedInput).toHaveValue("");
    expect(reopenedInput).not.toHaveAttribute("aria-activedescendant");
    await user.click(within(reopened).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("exports no production cache-reset API", async () => {
    const exports = await import("./site-search-launcher");
    expect(Object.keys(exports).filter((name) => /reset|cache/iu.test(name))).toEqual([]);
  });
});
