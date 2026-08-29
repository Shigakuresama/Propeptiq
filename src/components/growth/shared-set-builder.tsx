"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

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

function sharedSetFailureMessage(code: SharedSetActionResult["code"]): string {
  if (code === "conflict") {
    return "This set changed before it could be saved. Review the current set and try again.";
  }
  if (code === "invalid") {
    return "Check the label, product selection, and quantities before trying again.";
  }
  if (code === "identity") {
    return "An active buyer account is required to change research sets.";
  }
  if (code === "origin") {
    return "This request could not be verified. Refresh the page and try again.";
  }
  if (code === "rate_limit") {
    return "Too many attempts were made. Please wait and try again.";
  }
  return "The research set could not be saved safely. Please try again.";
}

function deactivateFailureMessage(code: SharedSetActionResult["code"]): string {
  if (code === "conflict") {
    return "This set changed before it could be deactivated. Review the current set and try again.";
  }
  if (code === "identity") {
    return "An active buyer account is required to deactivate research sets.";
  }
  if (code === "origin") {
    return "This request could not be verified. Refresh the page and try again.";
  }
  if (code === "rate_limit") {
    return "Too many attempts were made. Please wait and try again.";
  }
  return "The research set could not be deactivated safely. Please try again.";
}

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
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.state === "error") errorRef.current?.focus();
  }, [state]);
  const selectedItems = products.flatMap(({ id }) => {
    const quantity = quantities[id];
    return quantity === undefined ? [] : [{ productId: id, quantity }];
  });
  const validCount = selectedItems.length >= 2 && selectedItems.length <= 8;
  const label = mode === "create"
    ? "Create research set"
    : `Update ${initialSet?.label ?? "research set"}`;
  const fieldPrefix = `${mode}-${initialSet?.code ?? "new"}`;
  const selectionErrorId = `${fieldPrefix}-selection-error`;

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
        <label className="form-label" htmlFor={`${fieldPrefix}-label`}>
          Neutral label
        </label>
        <input
          id={`${fieldPrefix}-label`}
          name="label"
          className="form-input"
          required
          aria-required="true"
          maxLength={120}
          defaultValue={initialSet?.label ?? ""}
        />
      </div>
      <fieldset
        className="grid gap-3"
        aria-describedby={!validCount ? selectionErrorId : undefined}
      >
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
              <div>
                <label className="form-label text-base" htmlFor={`${fieldPrefix}-${product.id}-quantity`}>
                  Quantity
                </label>
                <input
                  id={`${fieldPrefix}-${product.id}-quantity`}
                  aria-label={`${product.name} quantity`}
                  className="form-input min-h-11"
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
            </div>
          );
        })}
      </fieldset>
      {!validCount ? (
        <div className="error-record" role="alert">
          <strong>Research set needs attention</strong>
          <p id={selectionErrorId} className="mt-2 text-base leading-7">Select 2 to 8 products.</p>
        </div>
      ) : null}
      {state.state === "error" ? (
        <div ref={errorRef} className="error-record" role="alert" tabIndex={-1}>
          <strong>Research set was not saved</strong>
          <p className="mt-2 text-base leading-7">{sharedSetFailureMessage(state.code)}</p>
        </div>
      ) : state.state === "success" ? (
        <p className="info-record" role="status" aria-live="polite">Research set saved.</p>
      ) : null}
      <Button type="submit" className="action-primary min-h-11" disabled={!validCount || pending}>
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
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.state === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} aria-label={`Deactivate ${label}`} className="grid gap-3">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.state === "error" ? (
        <div ref={errorRef} className="error-record" role="alert" tabIndex={-1}>
          <strong>Research set was not deactivated</strong>
          <p className="mt-2 text-base leading-7">{deactivateFailureMessage(state.code)}</p>
        </div>
      ) : state.state === "success" ? (
        <p className="info-record" role="status" aria-live="polite">Research set deactivated.</p>
      ) : null}
      <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>
        {pending ? "Deactivating…" : `Deactivate ${label}`}
      </Button>
    </form>
  );
}
