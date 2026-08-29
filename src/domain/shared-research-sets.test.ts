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

const canonicalSet = {
  code: "set_Q7tcqpk1rXv2ABcd",
  label: "Analytical comparison set",
  items: [
    { productId: "product-a", quantity: 1 },
    { productId: "product-b", quantity: 25 },
  ],
};

function project(
  sharedSet: unknown,
  currentProducts: unknown = [
    { id: "product-a", active: true, name: "Record A" },
    { id: "product-b", active: false, name: "Record B" },
  ],
) {
  return projectPublicSharedResearchSet({
    sharedSet,
    currentProducts,
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

  it.each([
    ["an extra description", { ...canonicalSet, description: "not allowed" }, "unexpected_field", "description"],
    ["a prohibited label", { ...canonicalSet, label: "Treatment comparison set" }, "invalid_label", "label"],
    ["an invalid opaque code", { ...canonicalSet, code: "set name" }, "invalid_code", "code"],
    ["too few items", { ...canonicalSet, items: [canonicalSet.items[0]] }, "invalid_input", "items"],
    ["duplicate items", { ...canonicalSet, items: [canonicalSet.items[0], { ...canonicalSet.items[1], productId: "product-a" }] }, "invalid_item", "items[1].productId"],
    ["an invalid quantity", { ...canonicalSet, items: [{ ...canonicalSet.items[0], quantity: 26 }, canonicalSet.items[1]] }, "invalid_item", "items[0].quantity"],
  ] as const)("rejects a public projection with %s", (_name, sharedSet, code, field) => {
    expect(project(sharedSet)).toEqual({ ok: false, error: { code, field } });
  });

  it("rejects sparse, inherited, and non-own shared-set inputs before public projection", () => {
    const sparse = [canonicalSet.items[0]];
    sparse.length = 2;
    expect(project({ ...canonicalSet, items: sparse })).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "items" },
    });
    expect(project(Object.create(canonicalSet))).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "sharedSet" },
    });
    expect(createSharedResearchSet(Object.create({ code: "set_Q7tcqpk1rXv2ABcd", label: "Analytical comparison set", items }))).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "input" },
    });
  });

  it("requires owned public product facts while accepting plain and null-prototype records", () => {
    const validProduct = { id: "product-a", active: true, name: "Record A" };
    const inheritedOnlyProduct = Object.create(validProduct);
    const nullPrototypeProduct = Object.assign(Object.create(null), validProduct);
    const inactiveProduct = { id: "product-b", active: false, name: "Record B" };

    expect(project(canonicalSet, [inheritedOnlyProduct, inactiveProduct])).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "currentProducts[0]" },
    });
    expect(project(canonicalSet, [validProduct, inactiveProduct])).toMatchObject({
      ok: true,
    });
    expect(project(canonicalSet, [nullPrototypeProduct, inactiveProduct])).toMatchObject({
      ok: true,
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
