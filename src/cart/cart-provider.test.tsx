import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-provider";
import { CART_STORAGE_KEY } from "./cart-storage";

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
