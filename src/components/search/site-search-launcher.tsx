"use client";

import { useCallback, useRef } from "react";

import { isApprovedPublicInformationHref } from "@/content/public-information";
import type { SearchEntry } from "@/search/storefront-search";
import type { StorefrontSearchIndex } from "@/search/storefront-index";

import { SiteSearchSheet } from "./site-search-sheet";

export type SiteSearchLauncherProps = Readonly<{
  loadIndex?: () => Promise<StorefrontSearchIndex>;
}>;

const WRAPPER_KEYS = Object.freeze(["entries", "version"]);
const ENTRY_KEYS = Object.freeze([
  "description",
  "exactTerms",
  "group",
  "href",
  "id",
  "keywords",
  "popularityRank",
  "title",
]);
const PRODUCT_HREF = /^\/catalog\/items\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UNSAFE_HREF = /[\s\u0000-\u001f\u007f-\u009f\\?%]/u;

function invalidIndex(): never {
  throw new TypeError("Invalid storefront search index.");
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidIndex();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalidIndex();
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== keys.length ||
    [...actualKeys].sort().some((key, index) => key !== keys[index])
  ) {
    return invalidIndex();
  }
  return value as Record<string, unknown>;
}

function nonblankString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return invalidIndex();
  }
  return value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : invalidIndex();
}

function denseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return invalidIndex();
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => {
    if (key === "length") return false;
    if (typeof key !== "string") return true;
    const index = Number(key);
    return !Number.isSafeInteger(index) || index < 0 || String(index) !== key;
  })) {
    return invalidIndex();
  }
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return invalidIndex();
    copy.push(value[index]);
  }
  if (ownKeys.length !== copy.length + 1) return invalidIndex();
  return copy;
}

function denseNonblankStrings(value: unknown): readonly string[] {
  return Object.freeze(denseArray(value).map(nonblankString));
}

function safeHref(group: SearchEntry["group"], value: unknown): string {
  const href = nonblankString(value);
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    UNSAFE_HREF.test(href)
  ) {
    return invalidIndex();
  }
  if (group === "products") {
    return PRODUCT_HREF.test(href) ? href : invalidIndex();
  }
  return isApprovedPublicInformationHref(href) ? href : invalidIndex();
}

function cloneEntry(value: unknown): SearchEntry {
  const source = exactRecord(value, ENTRY_KEYS);
  const group = source.group;
  if (group !== "products" && group !== "information") return invalidIndex();
  const popularityRank = source.popularityRank;
  if (
    popularityRank !== null &&
    (typeof popularityRank !== "number" ||
      !Number.isFinite(popularityRank) ||
      popularityRank <= 0)
  ) {
    return invalidIndex();
  }

  return Object.freeze({
    id: nonblankString(source.id),
    group,
    title: nonblankString(source.title),
    href: safeHref(group, source.href),
    description: stringValue(source.description),
    exactTerms: denseNonblankStrings(source.exactTerms),
    keywords: denseNonblankStrings(source.keywords),
    popularityRank,
  });
}

function cloneValidatedIndex(value: unknown): StorefrontSearchIndex {
  try {
    const source = exactRecord(value, WRAPPER_KEYS);
    if (source.version !== 1) return invalidIndex();
    const entries = denseArray(source.entries).map(cloneEntry);
    const ids = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) return invalidIndex();
      ids.add(entry.id);
    }
    return Object.freeze({
      version: 1,
      entries: Object.freeze(entries),
    });
  } catch {
    return invalidIndex();
  }
}

function loadAndValidate(
  loader: () => Promise<unknown>,
): Promise<StorefrontSearchIndex> {
  return Promise.resolve().then(loader).then(cloneValidatedIndex);
}

async function requestDefaultIndex(): Promise<unknown> {
  const response = await fetch("/api/storefront-search", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new TypeError("Storefront search index unavailable.");
  }
  return response.json();
}

let defaultIndexPromise: Promise<StorefrontSearchIndex> | null = null;

function loadDefaultIndex(): Promise<StorefrontSearchIndex> {
  if (defaultIndexPromise !== null) return defaultIndexPromise;
  const request = loadAndValidate(requestDefaultIndex);
  defaultIndexPromise = request;
  void request.catch(() => {
    if (defaultIndexPromise === request) defaultIndexPromise = null;
  });
  return request;
}

type InjectedCache = {
  loader: NonNullable<SiteSearchLauncherProps["loadIndex"]>;
  promise: Promise<StorefrontSearchIndex> | null;
};

export function SiteSearchLauncher({ loadIndex }: SiteSearchLauncherProps) {
  const injectedCache = useRef<InjectedCache | null>(null);

  const loadValidatedIndex = useCallback(() => {
    if (loadIndex === undefined) return loadDefaultIndex();
    let cache = injectedCache.current;
    if (cache === null || cache.loader !== loadIndex) {
      cache = { loader: loadIndex, promise: null };
      injectedCache.current = cache;
    }
    if (cache.promise !== null) return cache.promise;

    const request = loadAndValidate(loadIndex);
    cache.promise = request;
    void request.catch(() => {
      if (injectedCache.current === cache && cache.promise === request) {
        cache.promise = null;
      }
    });
    return request;
  }, [loadIndex]);

  return <SiteSearchSheet loadIndex={loadValidatedIndex} />;
}
