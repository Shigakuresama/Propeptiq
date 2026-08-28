import { describe, expect, it } from "vitest";

import {
  createSharedResearchSet,
  projectPublicSharedResearchSet,
} from "@/domain/shared-research-sets";

const items = [
  { productId: "product-a", quantity: 1, active: true },
  { productId: "product-b", quantity: 25, active: true },
] as const;

function create(overrides: Record<string, unknown> = {}) {
  return createSharedResearchSet({
    code: "set_Q7tcqpk1rXv2ABcd",
    label: "Analytical comparison set",
    items,
    ...overrides,
  });
}

describe("shared research set policies", () => {
  it("accepts a neutral label and 2–8 unique active product quantities", () => {
    expect(create()).toEqual({ ok: true, value: { code: "set_Q7tcqpk1rXv2ABcd", label: "Analytical comparison set", items: [{ productId: "product-a", quantity: 1 }, { productId: "product-b", quantity: 25 }] } });
  });

  it.each([
    ["one item", [items[0]], "items", "invalid_input"],
    ["a duplicate product", [items[0], { ...items[1], productId: "product-a" }], "items[1].productId", "invalid_item"],
    ["an inactive product", [{ ...items[0], active: false }, items[1]], "items[0].active", "invalid_item"],
    ["quantity zero", [{ ...items[0], quantity: 0 }, items[1]], "items[0].quantity", "invalid_item"],
    ["quantity above 25", [{ ...items[0], quantity: 26 }, items[1]], "items[0].quantity", "invalid_item"],
  ] as const)("rejects %s", (_name, candidate, field, code) => {
    expect(create({ items: candidate })).toEqual({ ok: false, error: { code, field } });
  });

  it("rejects non-opaque codes, labels beyond 120 characters, prohibited labels, and descriptions", () => {
    expect(create({ code: "comparison set" })).toEqual({ ok: false, error: { code: "invalid_code", field: "code" } });
    expect(create({ label: "a".repeat(121) })).toEqual({ ok: false, error: { code: "invalid_label", field: "label" } });
    expect(create({ label: "Treatment comparison set" })).toEqual({ ok: false, error: { code: "invalid_label", field: "label" } });
    expect(create({ description: "extra text" })).toEqual({ ok: false, error: { code: "unexpected_field", field: "description" } });
    expect(createSharedResearchSet(Object.assign(Object.create({ inherited: true }), { code: "set_Q7tcqpk1rXv2ABcd", label: "Analytical comparison set", items }))).toEqual({ ok: false, error: { code: "unexpected_field", field: "inherited" } });
  });

  it("rejects sparse arrays and projects only current active public products", () => {
    const sparse = [items[0]];
    sparse.length = 2;
    expect(create({ items: sparse })).toEqual({ ok: false, error: { code: "invalid_input", field: "items" } });
    const created = create();
    expect(projectPublicSharedResearchSet({ sharedSet: created.ok ? created.value : null, currentProducts: [{ id: "product-a", active: true, name: "Record A" }, { id: "product-b", active: false, name: "Record B" }] })).toEqual({
      ok: true,
      value: { code: "set_Q7tcqpk1rXv2ABcd", label: "Analytical comparison set", omittedProductIds: ["product-b"], items: [{ productId: "product-a", quantity: 1, name: "Record A" }] },
    });
  });

  it("returns deeply frozen set projections", () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
  });
});
