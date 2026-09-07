"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";

export function QuantityStepper({ quantity, maximum, onChange }: Readonly<{
  quantity: number;
  maximum: number;
  onChange: (quantity: number | null) => void;
}>) {
  const id = useId();
  const [draft, setDraft] = useState<{ text: string; quantity: number } | null>(null);
  const value = draft?.quantity === quantity ? draft.text : String(quantity);
  const invalid = value === "" || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum;

  function step(next: number) {
    setDraft(null);
    onChange(Math.max(1, Math.min(maximum, next)));
  }

  return <div className="quantity-stepper-field">
    <label htmlFor={id} className="purchase-field-label">Quantity</label>
    <div className="quantity-stepper">
      <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => step(quantity - 1)}>
        <Minus aria-hidden="true" size={16} />
      </button>
      <input id={id} type="number" inputMode="numeric" min={1} max={maximum} step={1} value={value}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
        onBlur={() => { setDraft(null); onChange(quantity); }}
        onChange={(event) => {
          const text = event.target.value;
          const next = Number(text);
          if (text !== "" && Number.isInteger(next) && next >= 1 && next <= maximum) {
            onChange(next);
            setDraft({ text, quantity: next });
          } else {
            setDraft({ text, quantity });
            onChange(null);
          }
        }} />
      <button type="button" aria-label="Increase quantity" disabled={quantity >= maximum} onClick={() => step(quantity + 1)}>
        <Plus aria-hidden="true" size={16} />
      </button>
    </div>
    {invalid ? <p id={`${id}-error`} className="mt-1 text-xs text-muted-ink">Enter 1–{maximum} whole units.</p> : null}
  </div>;
}
