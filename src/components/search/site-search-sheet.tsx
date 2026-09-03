"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { SearchIcon } from "lucide-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { searchEntries, type SearchResult } from "@/search/storefront-search";
import type { StorefrontSearchIndex } from "@/search/storefront-index";

const TEMPORARY_UNAVAILABLE =
  "Search is temporarily unavailable. Please try again.";
const EMPTY_PROMPT = "Type to search products and information.";

type LoadState =
  | Readonly<{ status: "idle" | "loading" | "error" }>
  | Readonly<{ status: "ready"; index: StorefrontSearchIndex }>;

type DisplayedResult = Readonly<{
  result: SearchResult;
  displayIndex: number;
}>;

function statusText(
  state: LoadState,
  hasQuery: boolean,
  resultCount: number,
): string {
  if (state.status === "loading" || state.status === "idle") {
    return "Loading search index.";
  }
  if (state.status === "error") return TEMPORARY_UNAVAILABLE;
  if (!hasQuery) return EMPTY_PROMPT;
  if (resultCount === 0) return "No results found.";
  return `${resultCount} ${resultCount === 1 ? "result" : "results"} found.`;
}

function ResultGroup({
  heading,
  results,
  resultId,
  onActive,
}: {
  heading: "Products" | "Pages or Information";
  results: readonly DisplayedResult[];
  resultId: (displayIndex: number) => string;
  onActive: (displayIndex: number) => void;
}) {
  if (results.length === 0) return null;
  return (
    <section className="grid gap-2" aria-label={heading}>
      <h3 className="font-heading text-sm font-semibold text-ink">{heading}</h3>
      <div className="grid gap-2">
        {results.map(({ result, displayIndex }) => (
          <SheetClose asChild key={result.entry.id}>
            <a
              className="block rounded-xl border border-border p-3 outline-none transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-ring"
              href={result.entry.href}
              id={resultId(displayIndex)}
              onFocus={() => onActive(displayIndex)}
              onPointerMove={() => onActive(displayIndex)}
            >
              <span className="block font-medium text-ink">{result.entry.title}</span>
              {result.entry.description.length > 0 ? (
                <span className="mt-1 block text-sm text-muted-ink">
                  {result.entry.description}
                </span>
              ) : null}
            </a>
          </SheetClose>
        ))}
      </div>
    </section>
  );
}

export function SiteSearchSheet({
  loadIndex,
}: Readonly<{
  loadIndex: () => Promise<StorefrontSearchIndex>;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const openRef = useRef(false);
  const generationRef = useRef(0);
  const previousLoaderRef = useRef(loadIndex);
  const resultsId = `site-search-results-${useId()}`;

  const beginLoad = useCallback(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoadState({ status: "loading" });
    void Promise.resolve()
      .then(loadIndex)
      .then(
        (index) => {
          if (openRef.current && generationRef.current === generation) {
            setActiveIndex(-1);
            setLoadState({ status: "ready", index });
          }
        },
        () => {
          if (openRef.current && generationRef.current === generation) {
            setActiveIndex(-1);
            setLoadState({ status: "error" });
          }
        },
      );
  }, [loadIndex]);

  useEffect(() => {
    if (previousLoaderRef.current === loadIndex) return;
    previousLoaderRef.current = loadIndex;
    if (openRef.current) beginLoad();
  }, [beginLoad, loadIndex]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      openRef.current = false;
      generationRef.current += 1;
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      setLoadState({ status: "idle" });
      return;
    }
    openRef.current = true;
    setOpen(true);
    setQuery("");
    setActiveIndex(-1);
    beginLoad();
  }, [beginLoad]);

  const hasQuery = query.trim().length > 0;
  const rankedResults = useMemo(
    () => loadState.status === "ready" && hasQuery
      ? searchEntries(loadState.index.entries, query)
      : Object.freeze([] as SearchResult[]),
    [hasQuery, loadState, query],
  );
  const displayedResults = useMemo(() => [
    ...rankedResults.filter((result) => result.entry.group === "products"),
    ...rankedResults.filter((result) => result.entry.group === "information"),
  ].map((result, displayIndex) => ({ result, displayIndex })), [rankedResults]);
  const productResults = displayedResults.filter(
    ({ result }) => result.entry.group === "products",
  );
  const informationResults = displayedResults.filter(
    ({ result }) => result.entry.group === "information",
  );
  const resultId = useCallback(
    (displayIndex: number) => `${resultsId}-result-${displayIndex}`,
    [resultsId],
  );
  const activeDescendant = activeIndex >= 0 && activeIndex < displayedResults.length
    ? resultId(activeIndex)
    : undefined;

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.currentTarget.value);
    setActiveIndex(-1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const count = displayedResults.length;
    if (event.key === "ArrowDown" && count > 0) {
      event.preventDefault();
      setActiveIndex((current) => current < 0 ? 0 : (current + 1) % count);
      return;
    }
    if (event.key === "ArrowUp" && count > 0) {
      event.preventDefault();
      setActiveIndex((current) => current <= 0 ? count - 1 : current - 1);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && activeIndex < count) {
      const anchor = document.getElementById(resultId(activeIndex));
      if (anchor instanceof HTMLAnchorElement) {
        event.preventDefault();
        anchor.click();
      }
    }
  }

  const message = statusText(loadState, hasQuery, displayedResults.length);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <div className="site-search-launcher-lane">
        <SheetTrigger asChild>
          <button
            aria-label="Search PropeptIQ"
            className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
            type="button"
          >
            <SearchIcon aria-hidden="true" className="size-4" />
            <span className="sr-only md:not-sr-only">SEARCH</span>
          </button>
        </SheetTrigger>
      </div>
      <SheetContent className="site-search-sheet w-full gap-0" side="bottom">
        <SheetHeader>
          <SheetTitle>Search PropeptIQ</SheetTitle>
          <SheetDescription>
            Find approved products and public information.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4 pb-3">
          <label className="font-medium text-ink" htmlFor={`${resultsId}-input`}>
            Search products and information
          </label>
          <input
            aria-activedescendant={activeDescendant}
            aria-controls={resultsId}
            autoComplete="off"
            autoFocus
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={`${resultsId}-input`}
            onChange={handleQueryChange}
            onKeyDown={handleSearchKeyDown}
            type="search"
            value={query}
          />
        </div>
        <div className="flex items-center gap-3 px-4 pb-3">
          <p aria-atomic="true" aria-live="polite" className="text-sm text-muted-ink" role="status">
            {message}
          </p>
          {loadState.status === "error" ? (
            <button
              className="min-h-11 rounded-full border border-border px-4 font-semibold focus-visible:ring-2 focus-visible:ring-ring"
              onClick={beginLoad}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </div>
        <div
          aria-busy={loadState.status === "loading" ? "true" : undefined}
          className="site-search-results flex flex-1 flex-col gap-5 px-4 pb-4"
          id={resultsId}
        >
          {loadState.status === "ready" && hasQuery ? (
            <>
              <ResultGroup
                heading="Products"
                onActive={setActiveIndex}
                resultId={resultId}
                results={productResults}
              />
              <ResultGroup
                heading="Pages or Information"
                onActive={setActiveIndex}
                resultId={resultId}
                results={informationResults}
              />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
