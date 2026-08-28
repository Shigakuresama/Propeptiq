"use client";

import { useActionState, useMemo, useState } from "react";

import type {
  SharedSetActionResult,
} from "@/growth/actions";
import { Button } from "@/components/ui/button";

type ProductOption = Readonly<{
  id: string;
  name: string;
  packageForm: string;
}>;

type InitialSet = Readonly<{
  code: string;
  label: string;
  updatedAt: string;
  items: readonly Readonly<{ productId: string; quantity: number }>[];
}>;

type BuilderState = SharedSetActionResult | Readonly<{
  state: "idle";
  code: "idle";
  set: null;
}>;

const initialState: BuilderState = Object.freeze({
  state: "idle",
  code: "idle",
  set: null,
});

export function SharedSetBuilder({
  mode,
  products,
  idempotencyKey,
  action,
  initialSet,
}: {
  mode: "create" | "update";
  products: readonly ProductOption[];
  idempotencyKey: string;
  action: (formData: FormData) => Promise<SharedSetActionResult>;
  initialSet?: InitialSet;
}) {
  const initialQuantities = useMemo(() => {
    const currentIds = new Set(products.map(({ id }) => id));
    const seeded = initialSet?.items.filter(({ productId }) => currentIds.has(productId))
      ?? products.slice(0, 2).map(({ id }) => ({ productId: id, quantity: 1 }));
    return Object.fromEntries(seeded.map(({ productId, quantity }) => [productId, quantity]));
  }, [initialSet, products]);
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [state, formAction, pending] = useActionState<BuilderState, FormData>(
    async (_previous, formData) => action(formData),
    initialState,
  );
  const selectedItems = products.flatMap(({ id }) => {
    const quantity = quantities[id];
    return quantity === undefined ? [] : [{ productId: id, quantity }];
  });
  const validCount = selectedItems.length >= 2 && selectedItems.length <= 8;
  const label = mode === "create"
    ? "Create research set"
    : `Update ${initialSet?.label ?? "research set"}`;

  return (
    <form action={formAction} aria-label={label} className="grid gap-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {mode === "update" && initialSet ? (
        <>
          <input type="hidden" name="code" value={initialSet.code} />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={initialSet.updatedAt}
          />
        </>
      ) : null}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(selectedItems)}
        data-testid="shared-set-items"
      />
      <div>
        <label className="form-label" htmlFor={`${mode}-${initialSet?.code ?? "new"}-label`}>
          Neutral label
        </label>
        <input
          id={`${mode}-${initialSet?.code ?? "new"}-label`}
          name="label"
          className="form-input"
          required
          maxLength={120}
          defaultValue={initialSet?.label ?? ""}
        />
      </div>
      <fieldset className="grid gap-3">
        <legend className="form-label">Current public products</legend>
        {products.map((product) => {
          const selected = quantities[product.id] !== undefined;
          return (
            <div className="record-row grid gap-3 sm:grid-cols-[1fr_7rem]" key={product.id}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => setQuantities((current) => {
                    if (event.target.checked) return { ...current, [product.id]: 1 };
                    const next = { ...current };
                    delete next[product.id];
                    return next;
                  })}
                />
                <span>{product.name} · {product.packageForm}</span>
              </label>
              <input
                aria-label={`${product.name} quantity`}
                className="form-input"
                type="number"
                min={1}
                max={25}
                step={1}
                disabled={!selected}
                value={quantities[product.id] ?? 1}
                onChange={(event) => setQuantities((current) => ({
                  ...current,
                  [product.id]: Math.max(1, Math.min(25, Math.floor(Number(event.target.value)))),
                }))}
              />
            </div>
          );
        })}
      </fieldset>
      {!validCount ? (
        <p className="error-record" role="alert">Select 2 to 8 products.</p>
      ) : null}
      {state.state !== "idle" ? (
        <p className={state.state === "success" ? "info-record" : "error-record"} role="status">
          {state.state === "success" ? "Research set saved." : "Research set was not saved."}
        </p>
      ) : null}
      <Button type="submit" className="action-primary" disabled={!validCount || pending}>
        {pending ? "Saving…" : label}
      </Button>
    </form>
  );
}

export function DeactivateSharedSetForm({
  code,
  label,
  expectedUpdatedAt,
  idempotencyKey,
  action,
}: {
  code: string;
  label: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  action: (formData: FormData) => Promise<SharedSetActionResult>;
}) {
  const [state, formAction, pending] = useActionState<BuilderState, FormData>(
    async (_previous, formData) => action(formData),
    initialState,
  );
  return (
    <form action={formAction} aria-label={`Deactivate ${label}`} className="grid gap-3">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.state !== "idle" ? (
        <p role="status">{state.state === "success" ? "Research set deactivated." : "Research set was not changed."}</p>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Deactivating…" : `Deactivate ${label}`}
      </Button>
    </form>
  );
}
