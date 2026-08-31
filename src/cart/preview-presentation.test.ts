import { describe, expect, it } from "vitest";

import {
  loadPreviewPresentation,
  PREVIEW_PRESENTATION_STORAGE_KEY,
  savePreviewPresentation,
} from "./preview-presentation";

const preview = {
  items: [{
    variantId: "61000000-0000-4000-8000-000000000001",
    quantity: 2,
    available: true,
    name: "Synthetic local test only — Alpha",
    packageForm: "Research vial",
    unitAmountMinor: 2400,
    lineSubtotalMinor: 4800,
    currency: "USD",
  }],
  subtotalMinor: 4800,
  currency: "USD",
  taxMinor: null,
  shippingMinor: null,
  finalDiscountMinor: null,
  previewToken: "a".repeat(64),
  requiresAcknowledgement: false,
  reasons: [],
} as const;

describe("same-tab cart preview presentation", () => {
  it("stores and restores only the bounded display snapshot and token", () => {
    const storage = new Map<string, string>();
    const port = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    savePreviewPresentation(port, preview);
    expect(loadPreviewPresentation(port)).toEqual(preview);
    expect(JSON.parse(storage.get(PREVIEW_PRESENTATION_STORAGE_KEY)!)).toEqual({
      schemaVersion: 1,
      preview,
    });
  });

  it("rejects extra authority fields, malformed tokens, and over-bounded display text", () => {
    const values = [
      { schemaVersion: 1, preview: { ...preview, totalMinor: 1 } },
      { schemaVersion: 1, preview: { ...preview, previewToken: "token" } },
      { schemaVersion: 1, preview: { ...preview, items: [{ ...preview.items[0], name: "x".repeat(241) }] } },
    ];
    for (const value of values) {
      const port = { getItem: () => JSON.stringify(value), setItem: () => undefined };
      expect(loadPreviewPresentation(port)).toBeNull();
    }
  });
});
