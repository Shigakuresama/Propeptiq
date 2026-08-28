import { scanPublicCopy } from "@/domain/content-policy";
import type { Result } from "@/domain/result";

type SharedSetItem = Readonly<{ productId: string; quantity: number }>;
export type SharedResearchSet = Readonly<{ code: string; label: string; items: readonly SharedSetItem[] }>;
type SharedSetError = Readonly<{ code: "invalid_input" | "unexpected_field" | "invalid_code" | "invalid_label" | "invalid_item"; field: string }>;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function dense(value: unknown): value is readonly unknown[] { return Array.isArray(value) && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean); }
function hasOwnFields(value: Record<string, unknown>, fields: readonly string[]): boolean { return fields.every((field) => Object.hasOwn(value, field)); }
function safeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function extras(value: Record<string, unknown>, allowed: readonly string[]): string | null { const set = new Set(allowed); for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !set.has(key)) return typeof key === "string" ? key : ""; let prototype = Object.getPrototypeOf(value) as object | null; while (prototype !== null && prototype !== Object.prototype) { for (const key of Reflect.ownKeys(prototype)) if (typeof key !== "string" || !set.has(key)) return typeof key === "string" ? key : ""; prototype = Object.getPrototypeOf(prototype) as object | null; } return null; }
function freeze<Value>(value: Value): Value { if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested); } return value; }
function fail(code: SharedSetError["code"], field: string): Result<never, SharedSetError> { return Object.freeze({ ok: false, error: Object.freeze({ code, field }) }); }

export function parseSharedResearchSet(input: unknown): Result<SharedResearchSet, SharedSetError> {
  if (!isRecord(input) || !hasOwnFields(input, ["code", "label", "items"])) return fail("invalid_input", "input");
  const extra = extras(input, ["code", "label", "items"]); if (extra !== null) return fail("unexpected_field", extra);
  if (typeof input.code !== "string" || !/^set_[A-Za-z0-9_-]{16,64}$/.test(input.code)) return fail("invalid_code", "code");
  if (typeof input.label !== "string") return fail("invalid_label", "label");
  const label = input.label.trim().replace(/\s+/gu, " ");
  if (label.length < 1 || label.length > 120 || !scanPublicCopy({ text: label, claims: [] }, { version: "shared-set-label-v1", activeLotEvidenceIds: [] }).publishable) return fail("invalid_label", "label");
  if (!dense(input.items) || input.items.length < 2 || input.items.length > 8) return fail("invalid_input", "items");
  const ids = new Set<string>(); const items: SharedSetItem[] = [];
  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index];
    if (!isRecord(item) || !hasOwnFields(item, ["productId", "quantity"]) || extras(item, ["productId", "quantity"]) !== null || typeof item.productId !== "string" || item.productId.trim().length === 0 || ids.has(item.productId)) return fail("invalid_item", `items[${index}].productId`);
    const quantity = item.quantity;
    if (!safeInteger(quantity) || quantity < 1 || quantity > 25) return fail("invalid_item", `items[${index}].quantity`);
    ids.add(item.productId); items.push({ productId: item.productId, quantity });
  }
  items.sort((left, right) => left.productId.localeCompare(right.productId));
  return Object.freeze({ ok: true, value: freeze({ code: input.code, label, items }) });
}

export function createSharedResearchSet(input: unknown): Result<SharedResearchSet, SharedSetError> {
  if (!isRecord(input) || !hasOwnFields(input, ["code", "label", "items"])) return fail("invalid_input", "input");
  const extra = extras(input, ["code", "label", "items"]); if (extra !== null) return fail("unexpected_field", extra);
  if (typeof input.code !== "string" || !/^set_[A-Za-z0-9_-]{16,64}$/.test(input.code)) return fail("invalid_code", "code");
  if (typeof input.label !== "string") return fail("invalid_label", "label");
  const label = input.label.trim().replace(/\s+/gu, " ");
  if (label.length < 1 || label.length > 120 || !scanPublicCopy({ text: label, claims: [] }, { version: "shared-set-label-v1", activeLotEvidenceIds: [] }).publishable) return fail("invalid_label", "label");
  if (!dense(input.items) || input.items.length < 2 || input.items.length > 8) return fail("invalid_input", "items");
  const ids = new Set<string>(); const items: SharedSetItem[] = [];
  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index]; if (!isRecord(item) || !hasOwnFields(item, ["productId", "quantity", "active"]) || extras(item, ["productId", "quantity", "active"]) !== null || typeof item.productId !== "string" || item.productId.trim().length === 0 || ids.has(item.productId)) return fail("invalid_item", `items[${index}].productId`);
    const quantity = item.quantity;
    if (!safeInteger(quantity) || quantity < 1 || quantity > 25) return fail("invalid_item", `items[${index}].quantity`);
    if (item.active !== true) return fail("invalid_item", `items[${index}].active`);
    ids.add(item.productId); items.push({ productId: item.productId, quantity });
  }
  items.sort((left, right) => left.productId.localeCompare(right.productId));
  return parseSharedResearchSet({ code: input.code, label, items });
}

export function projectPublicSharedResearchSet(input: unknown): Result<Readonly<{ code: string; label: string; omittedProductIds: readonly string[]; items: readonly Readonly<{ productId: string; quantity: number; name: string }>[] }>, SharedSetError> {
  if (!isRecord(input) || !hasOwnFields(input, ["sharedSet", "currentProducts"])) return fail("invalid_input", "input");
  const extra = extras(input, ["sharedSet", "currentProducts"]); if (extra !== null) return fail("unexpected_field", extra);
  if (!isRecord(input.sharedSet) || !hasOwnFields(input.sharedSet, ["code", "label", "items"])) return fail("invalid_input", "sharedSet");
  const sharedSet = parseSharedResearchSet(input.sharedSet);
  if (!sharedSet.ok) return sharedSet;
  if (!dense(input.currentProducts)) return fail("invalid_input", "currentProducts");
  const products = new Map<string, { active: boolean; name: string }>();
  for (let index = 0; index < input.currentProducts.length; index += 1) { const product = input.currentProducts[index]; if (!isRecord(product) || !hasOwnFields(product, ["id", "active", "name"]) || extras(product, ["id", "active", "name"]) !== null || typeof product.id !== "string" || product.id.trim().length === 0 || typeof product.active !== "boolean" || typeof product.name !== "string" || product.name.trim().length === 0 || products.has(product.id)) return fail("invalid_input", `currentProducts[${index}]`); products.set(product.id, { active: product.active, name: product.name }); }
  const items: Array<{ productId: string; quantity: number; name: string }> = []; const omittedProductIds: string[] = [];
  for (const item of sharedSet.value.items) { const product = products.get(item.productId); if (product?.active) items.push({ productId: item.productId, quantity: item.quantity, name: product.name }); else omittedProductIds.push(item.productId); }
  return Object.freeze({ ok: true, value: freeze({ code: sharedSet.value.code, label: sharedSet.value.label, omittedProductIds, items }) });
}
