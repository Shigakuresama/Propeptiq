import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-provider";
import { CART_STORAGE_KEY, LEGACY_CART_STORAGE_KEY, loadCart } from "./cart-storage";

// Clearly fictional, browser-local cart fixtures; no catalog or provider authority.
const nonemptyLegacyFixture = JSON.stringify({
  version: 1,
  items: [{ productId: "synthetic-legacy-product", quantity: 2 }],
});
const emptyLegacyFixture = JSON.stringify({ version: 1, items: [] });

function LegacyCartHarness({ immediate = false }: { immediate?: boolean }) {
  const { addVariant, acknowledgeLegacyReselection, hydrated, items, legacyItemCount } = useCart();
  const [result, setResult] = useState("not attempted");
  const attempted = useRef(false);
  function add() {
    setResult(addVariant("synthetic-canonical-10mg", 2, {
      productName: "Synthetic Product Alpha", variantLabel: "10 mg",
    }) ? "accepted" : "rejected");
  }
  useLayoutEffect(() => {
    if (!immediate || attempted.current) return;
    attempted.current = true;
    setResult(addVariant("synthetic-canonical-10mg", 2, {
      productName: "Synthetic Product Alpha", variantLabel: "10 mg",
    }) ? "accepted" : "rejected");
  }, [addVariant, immediate]);
  function replaceFromOtherTab(serialized: string | null) {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    if (serialized === null) window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
    else window.localStorage.setItem(LEGACY_CART_STORAGE_KEY, serialized);
    window.dispatchEvent(new StorageEvent("storage", {
      key: LEGACY_CART_STORAGE_KEY,
      storageArea: window.localStorage,
    }));
    add();
  }
  return <>
    <p>{hydrated ? "Legacy cart hydrated" : "Legacy cart loading"}</p>
    <output aria-label="Legacy cart lines">{JSON.stringify(items)}</output>
    <output aria-label="Legacy count">{legacyItemCount === null ? "none" : legacyItemCount}</output>
    <output aria-label="Legacy add result">{result}</output>
    <button onClick={add} type="button">Add canonical variant</button>
    <button onClick={() => { acknowledgeLegacyReselection(); add(); }} type="button">Acknowledge then add</button>
    <button onClick={() => replaceFromOtherTab(nonemptyLegacyFixture)} type="button">Other tab restores old cart then add</button>
    <button onClick={() => replaceFromOtherTab(emptyLegacyFixture)} type="button">Other tab empties old cart then add</button>
    <button onClick={() => replaceFromOtherTab(null)} type="button">Other tab acknowledges old cart then add</button>
  </>;
}

function CartHarness() {
  const { addVariant, hydrated, items } = useCart();
  return (
    <div>
      <p>{hydrated ? "Cart hydrated" : "Cart loading"}</p>
      <output aria-label="Cart lines">{JSON.stringify(items)}</output>
      <button
        onClick={() =>
          addVariant("variant-5mg", 1, {
            productName: "Synthetic Product Alpha",
            variantLabel: "5 mg",
          })
        }
        type="button"
      >
        Add 5 mg once
      </button>
      <button
        onClick={() =>
          addVariant("variant-5mg", 2, {
            productName: "Synthetic Product Alpha",
            variantLabel: "5 mg",
          })
        }
        type="button"
      >
        Add 5 mg twice
      </button>
      <button
        onClick={() =>
          addVariant("variant-10mg", 2, {
            productName: "Synthetic Product Alpha",
            variantLabel: "10 mg",
          })
        }
        type="button"
      >
        Add 10 mg twice
      </button>
      <button
        onClick={() =>
          addVariant("variant-5mg", 25, {
            productName: "Synthetic Product Alpha",
            variantLabel: "5 mg",
          })
        }
        type="button"
      >
        Fill 5 mg line
      </button>
    </div>
  );
}

function CapacityHarness() {
  const { addVariant, hydrated, items } = useCart();
  const [lastResult, setLastResult] = useState("not attempted");

  function recordAdd(variantId: string) {
    setLastResult(addVariant(variantId) ? "accepted" : "rejected");
  }

  return (
    <div>
      <p>{hydrated ? "Capacity cart hydrated" : "Capacity cart loading"}</p>
      <output aria-label="Capacity cart lines">{JSON.stringify(items)}</output>
      <output aria-label="Last add result">{lastResult}</output>
      <button onClick={() => recordAdd("variant-00")} type="button">
        Grow existing line
      </button>
      <button onClick={() => recordAdd("variant-51")} type="button">
        Add fifty-first line
      </button>
    </div>
  );
}

function ImmediateAddHarness() {
  const { addVariant, items } = useCart();
  const attempted = useRef(false);

  useLayoutEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    addVariant("variant-immediate", 1, {
      productName: "Synthetic Product Alpha",
      variantLabel: "Immediate",
    });
  }, [addVariant]);

  return <output aria-label="Immediate cart lines">{JSON.stringify(items)}</output>;
}

function AcceptedThenRejectedHarness() {
  const { addVariant, items } = useCart();
  const attempted = useRef(false);

  useLayoutEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    addVariant("variant-00", 1, { variantLabel: "Existing" });
    addVariant("variant-51", 1, { variantLabel: "Rejected" });
  }, [addVariant]);

  return <output aria-label="Ordered cart lines">{JSON.stringify(items)}</output>;
}

function HydratedExistingAddHarness() {
  const { addVariant, hydrated, items } = useCart();
  const attempted = useRef(false);

  useLayoutEffect(() => {
    if (!hydrated || attempted.current) return;
    attempted.current = true;
    addVariant("variant-existing", 1, { variantLabel: "Existing" });
  }, [addVariant, hydrated]);

  return <output aria-label="Hydrated existing cart lines">{JSON.stringify(items)}</output>;
}

function AcceptedThenQuantityHarness() {
  const { addVariant, items, setQuantity } = useCart();
  const attempted = useRef(false);

  useLayoutEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    addVariant("variant-latest", 1, { variantLabel: "Stale add" });
    setQuantity("variant-latest", 2);
    setQuantity("variant-latest", 1);
  }, [addVariant, setQuantity]);

  return <output aria-label="Latest mutation cart lines">{JSON.stringify(items)}</output>;
}

function PendingAddThenStorageClearHarness() {
  const { addVariant, hydrated, items } = useCart();
  const attempted = useRef(false);
  const [phase, setPhase] = useState("waiting");

  useLayoutEffect(() => {
    if (!hydrated || attempted.current) return;
    attempted.current = true;
    addVariant("variant-cleared", 1, { variantLabel: "Cleared" });
    window.localStorage.clear();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
        storageArea: window.localStorage,
      }),
    );
    setPhase("clear dispatched");
  }, [addVariant, hydrated]);

  return (
    <>
      <p>{phase}</p>
      <output aria-label="Storage-clear cart lines">{JSON.stringify(items)}</output>
    </>
  );
}

function PendingAddThenUnknownStorageClearHarness() {
  const { addVariant, hydrated, items } = useCart();
  const attempted = useRef(false);

  useLayoutEffect(() => {
    if (!hydrated || attempted.current) return;
    attempted.current = true;
    addVariant("variant-unknown-storage", 1, { variantLabel: "Unknown storage" });
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
        storageArea: null,
      }),
    );
  }, [addVariant, hydrated]);

  return (
    <output aria-label="Unknown-storage cart lines">{JSON.stringify(items)}</output>
  );
}

describe("CartProvider exact-variant announcements", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists an immediate canonical add over an empty legacy cart and restores it after remount", async () => {
    window.localStorage.setItem(LEGACY_CART_STORAGE_KEY, emptyLegacyFixture);
    const mounted = render(<CartProvider><LegacyCartHarness immediate /></CartProvider>);
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("accepted");
    expect(screen.getByLabelText("Legacy count")).toHaveTextContent("none");
    await waitFor(() => expect(loadCart(window.localStorage)).toEqual({
      status: "ready", items: [{ variantId: "synthetic-canonical-10mg", quantity: 2 }],
    }));
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!)).toEqual({
      version: 2, items: [{ variantId: "synthetic-canonical-10mg", quantity: 2 }],
    });
    mounted.unmount();
    render(<CartProvider><LegacyCartHarness /></CartProvider>);
    await screen.findByText("Legacy cart hydrated");
    expect(screen.getByLabelText("Legacy cart lines")).toHaveTextContent(
      '[{"variantId":"synthetic-canonical-10mg","quantity":2}]',
    );
    expect(screen.getByLabelText("Legacy count")).toHaveTextContent("none");
  });

  it.each([false, true])("rejects a nonempty legacy cart add without changing storage or announcing success (immediate=%s)", async (immediate) => {
    window.localStorage.setItem(LEGACY_CART_STORAGE_KEY, nonemptyLegacyFixture);
    render(<CartProvider><LegacyCartHarness immediate={immediate} /></CartProvider>);
    if (!immediate) {
      await screen.findByText("Legacy cart hydrated");
      fireEvent.click(screen.getByRole("button", { name: "Add canonical variant" }));
    }
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("rejected");
    expect(screen.getByLabelText("Legacy cart lines")).toHaveTextContent("[]");
    expect(screen.getByLabelText("Legacy count")).toHaveTextContent("2");
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Open your cart and clear the old cart before choosing variants again. Your saved items have not been changed.",
    );
    expect(screen.getByRole("status", { name: "Cart updates" })).not.toHaveTextContent("Cart updated");
    expect(window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBe(nonemptyLegacyFixture);
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("accepts and persists an add in the same event as explicit legacy acknowledgement", async () => {
    window.localStorage.setItem(LEGACY_CART_STORAGE_KEY, nonemptyLegacyFixture);
    render(<CartProvider><LegacyCartHarness /></CartProvider>);
    await screen.findByText("Legacy cart hydrated");
    fireEvent.click(screen.getByRole("button", { name: "Add canonical variant" }));
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("rejected");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge then add" }));
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("accepted");
    expect(window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
    expect(loadCart(window.localStorage)).toEqual({
      status: "ready", items: [{ variantId: "synthetic-canonical-10mg", quantity: 2 }],
    });
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 10 mg: 2 units in cart.",
    );
  });

  it("blocks a synchronous add when another tab restores nonempty legacy storage", async () => {
    render(<CartProvider><LegacyCartHarness /></CartProvider>);
    await screen.findByText("Legacy cart hydrated");
    fireEvent.click(screen.getByRole("button", { name: "Add canonical variant" }));
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("accepted");
    fireEvent.click(screen.getByRole("button", { name: "Other tab restores old cart then add" }));
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("rejected");
    expect(screen.getByLabelText("Legacy cart lines")).toHaveTextContent("[]");
    expect(screen.getByLabelText("Legacy count")).toHaveTextContent("2");
    expect(screen.getByRole("status", { name: "Cart updates" })).not.toHaveTextContent("Cart updated");
    expect(window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBe(nonemptyLegacyFixture);
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it.each(["Other tab empties old cart then add", "Other tab acknowledges old cart then add"])("accepts a synchronous add after %s", async (action) => {
    window.localStorage.setItem(LEGACY_CART_STORAGE_KEY, nonemptyLegacyFixture);
    render(<CartProvider><LegacyCartHarness /></CartProvider>);
    await screen.findByText("Legacy cart hydrated");
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByLabelText("Legacy add result")).toHaveTextContent("accepted");
    expect(screen.getByLabelText("Legacy count")).toHaveTextContent("none");
    expect(loadCart(window.localStorage)).toEqual({
      status: "ready", items: [{ variantId: "synthetic-canonical-10mg", quantity: 2 }],
    });
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 10 mg: 2 units in cart.",
    );
  });

  it("merges repeated exact variants, separates mg variants, and announces normalized quantity once", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartHarness />
      </CartProvider>,
    );
    await screen.findByText("Cart hydrated");

    const status = screen.getByRole("status", { name: "Cart updates" });
    expect(screen.getAllByRole("status", { name: "Cart updates" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add 5 mg once" }));
    expect(status).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 1 unit in cart.",
    );

    await user.click(screen.getByRole("button", { name: "Add 5 mg twice" }));
    expect(status).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 3 units in cart.",
    );
    expect(status.textContent?.match(/3 units in cart/gu)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add 10 mg twice" }));
    expect(screen.getByLabelText("Cart lines")).toHaveTextContent(
      JSON.stringify([
        { variantId: "variant-5mg", quantity: 3 },
        { variantId: "variant-10mg", quantity: 2 },
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Fill 5 mg line" }));
    expect(status).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 25 units in cart.",
    );

    await user.click(screen.getByRole("button", { name: "Add 5 mg once" }));
    expect(status).toHaveTextContent("The cart was not changed.");
    expect(screen.getByLabelText("Cart lines")).toHaveTextContent(
      JSON.stringify({ variantId: "variant-5mg", quantity: 25 }),
    );
  });

  it("never persists transient announcement labels", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartHarness />
      </CartProvider>,
    );
    await screen.findByText("Cart hydrated");
    await user.click(screen.getByRole("button", { name: "Add 5 mg once" }));

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null")).toEqual({
        version: 2,
        items: [{ variantId: "variant-5mg", quantity: 1 }],
      });
    });
    const serialized = window.localStorage.getItem(CART_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain("Synthetic Product Alpha");
    expect(serialized).not.toContain("5 mg");
  });

  it("retains a pending success announcement through an intermediate stale items snapshot", async () => {
    render(
      <CartProvider>
        <ImmediateAddHarness />
      </CartProvider>,
    );

    expect(screen.getByLabelText("Immediate cart lines")).toHaveTextContent(
      JSON.stringify([{ variantId: "variant-immediate", quantity: 1 }]),
    );
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, Immediate: 1 unit in cart.",
    );
  });

  it("keeps a newer explicit rejection authoritative over an older pending success", () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: Array.from({ length: 50 }, (_, index) => ({
          variantId: `variant-${String(index).padStart(2, "0")}`,
          quantity: 1,
        })),
      }),
    );

    render(
      <CartProvider>
        <AcceptedThenRejectedHarness />
      </CartProvider>,
    );

    expect(screen.getByLabelText("Ordered cart lines")).toHaveTextContent(
      JSON.stringify({ variantId: "variant-00", quantity: 2 }),
    );
    expect(screen.getByLabelText("Ordered cart lines")).not.toHaveTextContent(
      "variant-51",
    );
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "The cart was not changed.",
    );
  });

  it("waits for the exact expected post-add quantity before announcing success", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: [{ variantId: "variant-existing", quantity: 24 }],
      }),
    );

    render(
      <CartProvider>
        <HydratedExistingAddHarness />
      </CartProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Hydrated existing cart lines")).toHaveTextContent(
        JSON.stringify([{ variantId: "variant-existing", quantity: 25 }]),
      );
    });
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Cart updated. Existing: 25 units in cart.",
    );
  });

  it("lets a newer explicit quantity mutation cancel an older pending success", () => {
    render(
      <CartProvider>
        <AcceptedThenQuantityHarness />
      </CartProvider>,
    );

    expect(screen.getByLabelText("Latest mutation cart lines")).toHaveTextContent(
      JSON.stringify([{ variantId: "variant-latest", quantity: 1 }]),
    );
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Quantity updated to 1.",
    );
  });

  it("reloads cleared storage and cancels a pending success for key-null events", async () => {
    render(
      <CartProvider>
        <PendingAddThenStorageClearHarness />
      </CartProvider>,
    );

    await screen.findByText("clear dispatched");
    expect(screen.getByLabelText("Storage-clear cart lines")).toHaveTextContent("[]");
    expect(screen.getByRole("status", { name: "Cart updates" })).toBeEmptyDOMElement();
  });

  it("ignores key-null events whose storage area is unknown", async () => {
    render(
      <CartProvider>
        <PendingAddThenUnknownStorageClearHarness />
      </CartProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Unknown-storage cart lines")).toHaveTextContent(
        JSON.stringify([{ variantId: "variant-unknown-storage", quantity: 1 }]),
      );
    });
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Cart updated. Unknown storage: 1 unit in cart.",
    );
  });

  it("keeps an exact-variant add made before deferred hydration alongside stored lines", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: [{ variantId: "variant-stored", quantity: 2 }],
      }),
    );
    render(
      <CartProvider>
        <CartHarness />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add 5 mg once" }));

    await screen.findByText("Cart hydrated");
    expect(screen.getByLabelText("Cart lines")).toHaveTextContent(
      JSON.stringify([
        { variantId: "variant-stored", quantity: 2 },
        { variantId: "variant-5mg", quantity: 1 },
      ]),
    );
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 1 unit in cart.",
    );
  });

  it("reports accepted merges and rejected distinct lines from real normalization", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: Array.from({ length: 50 }, (_, index) => ({
          variantId: `variant-${String(index).padStart(2, "0")}`,
          quantity: 1,
        })),
      }),
    );
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CapacityHarness />
      </CartProvider>,
    );
    await screen.findByText("Capacity cart hydrated");

    await user.click(screen.getByRole("button", { name: "Grow existing line" }));
    expect(screen.getByLabelText("Last add result")).toHaveTextContent("accepted");
    expect(screen.getByLabelText("Capacity cart lines")).toHaveTextContent(
      JSON.stringify({ variantId: "variant-00", quantity: 2 }),
    );

    await user.click(screen.getByRole("button", { name: "Add fifty-first line" }));
    expect(screen.getByLabelText("Last add result")).toHaveTextContent("rejected");
    expect(screen.getByLabelText("Capacity cart lines")).not.toHaveTextContent(
      "variant-51",
    );
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent(
      "The cart was not changed.",
    );
  });
});
