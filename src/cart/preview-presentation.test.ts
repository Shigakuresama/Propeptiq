import { describe, expect, it } from "vitest";

import { createCartPreviewToken } from "./preview-token";
import type { CartPreviewItem } from "./preview-types";
import {
  loadPreviewPresentation,
  parsePreviewPresentation,
  PREVIEW_PRESENTATION_STORAGE_KEY,
  savePreviewPresentation,
} from "./preview-presentation";

function withToken<T extends { items: readonly CartPreviewItem[] }>(value: T) {
  return { ...value, previewToken: createCartPreviewToken(value.items) };
}

const preview = withToken({
  schemaVersion: 2,
  items: [{
    variantId: "61000000-0000-4000-8000-000000000001",
    quantity: 2,
    available: true,
    purchaseState: "ready",
    name: "Synthetic local test only — Alpha",
    packageForm: "Research vial",
    variantLabel: "Synthetic 5 mg",
    sku: "SYNTHETIC-5MG",
    baseUnitMinor: 2400,
    unitAmountMinor: 2208,
    lineSubtotalMinor: 4416,
    lineSavingsMinor: 384,
    effectiveDiscountBps: 800,
    appliedPromotions: [],
    currency: "USD",
  }],
  subtotalMinor: 4416,
  currency: "USD",
  taxMinor: null,
  shippingMinor: null,
  finalDiscountMinor: null,
  requiresAcknowledgement: false,
  reasons: [],
} as const);

describe("same-tab cart preview presentation", () => {
  it.each([
    ["identity", { name: "Synthetic renamed item" }, {}],
    ["amount", { baseUnitMinor: 2500, unitAmountMinor: 2300, lineSubtotalMinor: 4600, lineSavingsMinor: 400 }, { subtotalMinor: 4600 }],
    ["state", { available: false, purchaseState: "checkout_unavailable" }, { requiresAcknowledgement: true, reasons: ["checkout_unavailable"] }],
  ])("rejects changed %s facts with the original valid token", (_label, changedItem, changedRoot) => {
    const original = preview;
    expect(parsePreviewPresentation(original)).not.toBeNull();
    expect(parsePreviewPresentation({ ...original, ...changedRoot, items: [{ ...original.items[0], ...changedItem }] })).toBeNull();
  });

  it.each([
    { id: "winter30", label: "Changed public label" },
    { id: "different-promotion", label: "WINTER30" },
  ])("rejects changed promotion metadata %j with the original valid token", (changedPromotion) => {
    const items = [{ ...preview.items[0], unitAmountMinor: 1680, lineSubtotalMinor: 3360, lineSavingsMinor: 1440, effectiveDiscountBps: 3000, appliedPromotions: [{ id: "winter30", label: "WINTER30" }] }];
    const original = withToken({ ...preview, items, subtotalMinor: 3360 });
    expect(parsePreviewPresentation(original)).not.toBeNull();
    expect(parsePreviewPresentation({ ...original, items: [{ ...items[0], appliedPromotions: [changedPromotion] }] })).toBeNull();
  });

  it("accepts equivalent reordered JSON keys and binds storage to the item facts", () => {
    const original = withToken({ ...preview,
      items: [{ ...preview.items[0], unitAmountMinor: 1680, lineSubtotalMinor: 3360, lineSavingsMinor: 1440,
        effectiveDiscountBps: 3000, appliedPromotions: [{ id: "winter30", label: "WINTER30" }],
      }], subtotalMinor: 3360,
    });
    const reorderedItem = Object.fromEntries(Object.entries(original.items[0]!).reverse());
    reorderedItem.appliedPromotions = [{ label: "WINTER30", id: "winter30" }];
    const reordered = Object.fromEntries(Object.entries({ ...original, items: [reorderedItem] }).reverse());
    expect(parsePreviewPresentation(JSON.parse(JSON.stringify(reordered)))).toEqual(original);

    const changed = { ...preview, items: [{ ...preview.items[0], name: "Changed without a matching token" }] };
    const storage = new Map<string, string>();
    savePreviewPresentation({ setItem: (key, value) => storage.set(key, value) }, changed);
    expect(storage.size).toBe(0);
    expect(loadPreviewPresentation({ getItem: () => JSON.stringify({ schemaVersion: 2, preview: changed }) })).toBeNull();
  });

  it("stores and restores only the bounded display snapshot and token", () => {
    const storage = new Map<string, string>();
    const port = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    savePreviewPresentation(port, preview);
    expect(loadPreviewPresentation(port)).toEqual(preview);
    expect(JSON.parse(storage.get(PREVIEW_PRESENTATION_STORAGE_KEY)!)).toEqual({
      schemaVersion: 2,
      preview,
    });
  });

  it("rejects extra authority fields, malformed tokens, and over-bounded display text", () => {
    const values = [
      { schemaVersion: 2, preview: { ...preview, totalMinor: 1 } },
      { schemaVersion: 2, preview: { ...preview, previewToken: "token" } },
      { schemaVersion: 2, preview: { ...preview, items: [{ ...preview.items[0], name: "x".repeat(241) }] } },
    ];
    for (const value of values) {
      const port = { getItem: () => JSON.stringify(value), setItem: () => undefined };
      expect(loadPreviewPresentation(port)).toBeNull();
    }
  });

  it("discards stale schema and storage envelopes", () => {
    expect(parsePreviewPresentation({ ...preview, schemaVersion: 1 })).toBeNull();
    expect(loadPreviewPresentation({ getItem: () => JSON.stringify({ schemaVersion: 1, preview }) })).toBeNull();
    expect(PREVIEW_PRESENTATION_STORAGE_KEY).toBe("propeptiq.cart-preview.presentation.v2");
  });

  it("accepts every coherent display state and never adds checkout-safe authority", () => {
    expect(parsePreviewPresentation(preview)).toEqual(preview);
    for (const purchaseState of ["local_preview", "checkout_unavailable", "insufficient_quantity"] as const) {
      const input = withToken({ ...preview, items: [{ ...preview.items[0], available: false, purchaseState }], requiresAcknowledgement: true, reasons: [purchaseState === "insufficient_quantity" ? "insufficient_quantity" : "checkout_unavailable"] });
      expect(parsePreviewPresentation(input)).toEqual(input);
    }
    for (const purchaseState of ["pricing_pending", "unavailable", "unknown_variant"] as const) {
      const input = withToken({ ...preview, items: [{ ...preview.items[0], available: false, purchaseState,
        ...(purchaseState === "unknown_variant" ? { name: null, variantLabel: null, sku: null, packageForm: null } : {}),
        baseUnitMinor: null, unitAmountMinor: null, lineSubtotalMinor: null, lineSavingsMinor: null, effectiveDiscountBps: null, currency: null,
      }], subtotalMinor: 0, currency: null, requiresAcknowledgement: true, reasons: [purchaseState === "unavailable" ? "product_unavailable" : purchaseState] });
      expect(parsePreviewPresentation(input)).toEqual(input);
    }
  });

  it("rejects incoherent money, discount, identity, status, and reason facts without partial acceptance", () => {
    const changes = [
      { quantity: 0 }, { quantity: 26 }, { variantId: "bad id" }, { name: null },
      { variantLabel: null }, { sku: "" }, { currency: "EUR" }, { baseUnitMinor: 0 },
      { baseUnitMinor: Number.MAX_SAFE_INTEGER }, { unitAmountMinor: 2209 },
      { lineSubtotalMinor: 4417 }, { lineSavingsMinor: 385 }, { effectiveDiscountBps: 801 },
      { appliedPromotions: [{ id: "tier-is-not-a-campaign", label: "" }] },
      { appliedPromotions: [{ id: "promotion", label: "Sale", providerId: "private" }] },
      { appliedPromotions: [{ id: "promotion", label: "Sale" }, { id: "promotion", label: "Sale" }] },
      { available: false }, { purchaseState: "checkout_unavailable" }, { purchaseState: "invented" },
      { priceId: "private" },
    ];
    for (const change of changes) {
      // A matching hash cannot bypass the independent arithmetic/state/shape validation.
      const items = [{ ...preview.items[0], ...change }] as readonly CartPreviewItem[];
      expect(parsePreviewPresentation(withToken({ ...preview, items }))).toBeNull();
    }
    for (const change of [
      { subtotalMinor: 1 }, { currency: null }, { taxMinor: 0 }, { previewToken: "bad-token" },
      { requiresAcknowledgement: true }, { reasons: ["checkout_unavailable"] },
      { reasons: ["server_facts_changed", "server_facts_changed"], requiresAcknowledgement: true },
      { items: [preview.items[0], preview.items[0]], subtotalMinor: 8832 },
    ]) expect(parsePreviewPresentation({ ...preview, ...change })).toBeNull();
    expect(parsePreviewPresentation({ ...preview, reasons: ["server_facts_changed"], requiresAcknowledgement: true })).not.toBeNull();
  });

  it("rejects sparse arrays, array overrides, accessor fields and non-plain objects", () => {
    const hole = [preview.items[0], preview.items[0]];
    delete hole[0];
    const overridden = [preview.items[0]];
    Object.defineProperty(overridden, Symbol.iterator, { value: function* () { yield preview.items[0]; } });
    const getterItem = { ...preview.items[0] };
    Object.defineProperty(getterItem, "name", { get: () => { throw new Error("must not execute untrusted getter"); }, enumerable: true });
    expect(parsePreviewPresentation({ ...preview, items: hole })).toBeNull();
    expect(parsePreviewPresentation({ ...preview, items: overridden })).toBeNull();
    expect(parsePreviewPresentation({ ...preview, items: [getterItem] })).toBeNull();
    expect(parsePreviewPresentation(Object.create(preview))).toBeNull();
  });

  it("checks zero-layout arithmetic and one highest promotion without changing the input", () => {
    const input = withToken({ ...preview, items: [{ ...preview.items[0], available: false, purchaseState: "local_preview", baseUnitMinor: 0, unitAmountMinor: 0, lineSubtotalMinor: 0, lineSavingsMinor: 0,
      effectiveDiscountBps: 3000, appliedPromotions: [{ id: "winter30", label: "WINTER30" }],
    }], subtotalMinor: 0, reasons: ["checkout_unavailable"], requiresAcknowledgement: true });
    const before = JSON.stringify(input);
    const result = parsePreviewPresentation(input);
    expect(result).toEqual(input);
    expect(Object.isFrozen(result?.items[0]?.appliedPromotions[0])).toBe(true);
    expect(Object.isFrozen(result?.items)).toBe(true);
    expect(Object.isFrozen(input.items)).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });
});
