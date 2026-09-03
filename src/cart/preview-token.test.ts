import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { CartPreviewItem } from "./preview-types";
import { createCartPreviewToken, sha256Hex } from "./preview-token";

const line: CartPreviewItem = Object.freeze({
  variantId: "synthetic-unicode", quantity: 2, available: false, purchaseState: "local_preview",
  name: "Synthetic café — α 🧪", variantLabel: "Synthetic 5 μg", sku: "SYNTHETIC-5",
  packageForm: "1 bottle", baseUnitMinor: 2400, unitAmountMinor: 1680,
  lineSubtotalMinor: 3360, lineSavingsMinor: 1440, effectiveDiscountBps: 3000,
  appliedPromotions: Object.freeze([Object.freeze({ id: "winter30", label: "WINTER30" })]), currency: "USD",
});

describe("synchronous SHA-256", () => {
  // NIST's one- and two-block examples:
  // https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/examples/SHA256.pdf
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
  ])("matches the SHA-256 known-answer vector %j", (input, digest) => {
    expect(sha256Hex(input)).toBe(digest);
  });

  it.each([1, 55, 56, 63, 64, 65, 127, 128, 129, 1000])("matches Node across padding boundaries at %i ASCII bytes", (length) => {
    const input = "a".repeat(length);
    expect(sha256Hex(input)).toBe(createHash("sha256").update(input).digest("hex"));
  });

  it.each(["café — α 🧪", "\ud800", "\udc00", "🧪".repeat(32)])("matches Node UTF-8 encoding for %j", (input) => {
    expect(sha256Hex(input)).toBe(createHash("sha256").update(input).digest("hex"));
  });
});

describe("canonical display preview token", () => {
  it("matches Node SHA-256 for the exact canonical Unicode item JSON", () => {
    const items = Object.freeze([line]);
    const before = JSON.stringify(items);
    const digest = createCartPreviewToken(items);
    expect(digest).toBe(createHash("sha256").update(before).digest("hex"));
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(createCartPreviewToken(items)).toBe(digest);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("canonicalizes equivalent item and promotion key order without changing line order", () => {
    const reordered = Object.fromEntries(Object.entries(line).reverse()) as CartPreviewItem;
    const same = { ...reordered, appliedPromotions: [{ label: "WINTER30", id: "winter30" }] };
    expect(createCartPreviewToken([same])).toBe(createCartPreviewToken([line]));
    const second = { ...line, variantId: "synthetic-second" };
    expect(createCartPreviewToken([line, second])).not.toBe(createCartPreviewToken([second, line]));
  });

  it.each([
    { variantId: "synthetic-other" }, { quantity: 3 }, { name: "Synthetic new name" }, { variantLabel: "Synthetic 10 μg" },
    { sku: "SYNTHETIC-NEW" }, { packageForm: "2 bottles" },
    { purchaseState: "checkout_unavailable" as const }, { available: true },
    { baseUnitMinor: 2500 }, { unitAmountMinor: 1700 }, { lineSubtotalMinor: 3400 },
    { lineSavingsMinor: 1400 }, { effectiveDiscountBps: 3500 }, { currency: null },
    { appliedPromotions: [{ id: "new-promotion", label: "WINTER30" }] },
    { appliedPromotions: [{ id: "winter30", label: "Changed label" }] },
  ])("binds the exact changed item facts %j", (change) => {
    expect(createCartPreviewToken([{ ...line, ...change }])).not.toBe(createCartPreviewToken([line]));
  });
});
