import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_CART_ITEM_QUANTITY } from "@/cart/cart-storage";

export const QUANTITY_PRESETS = Object.freeze([
  { label: "1 bottle", quantity: 1 }, { label: "2 bottles", quantity: 2 },
  { label: "3 bottles", quantity: 3 }, { label: "10 or more bottles", quantity: 10 },
] as const);

export type QuantityTierSelectorProps = Readonly<{
  quantity: number; quantityDraft: string; errorId: string; errorMessage: string | null;
  onQuantityDraftChange: (draft: string) => void; onQuantitySelect: (quantity: number) => void;
}>;

export function QuantityTierSelector({ quantity, quantityDraft, errorId, errorMessage, onQuantityDraftChange, onQuantitySelect }: QuantityTierSelectorProps) {
  const invalid = errorMessage !== null;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="Quantity presets">
      {QUANTITY_PRESETS.map((preset) => <Button key={preset.quantity} type="button" variant="outline" className="min-h-11" aria-pressed={quantity === preset.quantity} onClick={() => onQuantitySelect(preset.quantity)}>{preset.label}</Button>)}
    </div>
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => onQuantitySelect(Math.max(1, quantity - 1))}><Minus aria-hidden="true" /></Button>
      <label className="sr-only" htmlFor="exact-quantity">Exact quantity</label>
      <input id="exact-quantity" className="min-h-11 w-24 rounded-lg border border-border bg-canvas px-3 text-center text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="number" min={1} max={MAX_CART_ITEM_QUANTITY} step={1} value={quantityDraft} aria-label="Exact quantity" aria-invalid={invalid ? "true" : undefined} aria-describedby={invalid ? errorId : undefined} onChange={(event) => onQuantityDraftChange(event.currentTarget.value)} />
      <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label="Increase quantity" disabled={quantity >= MAX_CART_ITEM_QUANTITY} onClick={() => onQuantitySelect(Math.min(MAX_CART_ITEM_QUANTITY, quantity + 1))}><Plus aria-hidden="true" /></Button>
    </div>
    {invalid ? <p id={errorId} className="text-sm text-destructive">{errorMessage}</p> : null}
  </div>;
}
