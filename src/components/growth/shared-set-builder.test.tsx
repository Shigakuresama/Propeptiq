import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeactivateSharedSetForm, SharedSetBuilder } from "./shared-set-builder";

const products = Object.freeze([
  Object.freeze({ id: "product-a", name: "Reference A", packageForm: "sealed unit" }),
  Object.freeze({ id: "product-b", name: "Reference B", packageForm: "sealed unit" }),
  Object.freeze({ id: "product-c", name: "Reference C", packageForm: "sealed unit" }),
]);

describe("SharedSetBuilder", () => {
  it("serializes only selected product IDs and bounded quantities for create", () => {
    render(
      <SharedSetBuilder
        mode="create"
        products={products}
        idempotencyKey="task-5c-builder-create-0001"
        action={vi.fn()}
      />,
    );

    expect(screen.getByRole("form", { name: "Create research set" })).toBeInTheDocument();
    const serialized = screen.getByTestId("shared-set-items");
    expect(serialized).toHaveValue(JSON.stringify([
      { productId: "product-a", quantity: 1 },
      { productId: "product-b", quantity: 1 },
    ]));
    expect(serialized).not.toHaveValue(expect.stringMatching(/price|discount|inventory|claim/iu));
  });

  it("includes exact code and expected version for update without owner fields", () => {
    const { container } = render(
      <SharedSetBuilder
        mode="update"
        products={products}
        idempotencyKey="task-5c-builder-update-0001"
        action={vi.fn()}
        initialSet={{
          code: "set_Task5CBuilderCode",
          label: "Neutral set",
          updatedAt: "2026-08-28T20:00:00.000Z",
          items: [{ productId: "product-b", quantity: 4 }, { productId: "product-c", quantity: 5 }],
        }}
      />,
    );

    expect(container.querySelector('input[name="code"]')).toHaveValue("set_Task5CBuilderCode");
    expect(container.querySelector('input[name="expectedUpdatedAt"]')).toHaveValue(
      "2026-08-28T20:00:00.000Z",
    );
    expect(container.querySelector('input[name="ownerUserId"]')).toBeNull();
    expect(screen.getByTestId("shared-set-items")).toHaveValue(JSON.stringify([
      { productId: "product-b", quantity: 4 },
      { productId: "product-c", quantity: 5 },
    ]));
  });

  it("focuses a customer-safe server error without rendering its raw code", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      state: "error",
      code: "conflict",
      set: null,
    });
    render(
      <SharedSetBuilder
        mode="create"
        products={products}
        idempotencyKey="task-7c2-builder-error-0001"
        action={action}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Neutral label" })).toHaveAttribute(
      "aria-required",
      "true",
    );
    await user.type(screen.getByRole("textbox", { name: "Neutral label" }), "Neutral set");
    await user.click(screen.getByRole("button", { name: "Create research set" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent(/changed before it could be saved/iu);
    expect(alert).not.toHaveTextContent("conflict");
  });

  it("announces success politely and submits only the allowed browser fields", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      state: "success",
      code: "created",
      set: {
        code: "set_Task7C2CreatedCode1",
        label: "Neutral set",
        active: true,
        itemCount: 2,
        updatedAt: "2026-08-28T20:00:00.000Z",
      },
    });
    render(
      <SharedSetBuilder
        mode="create"
        products={products}
        idempotencyKey="task-7c2-builder-success-0001"
        action={action}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Neutral label" }), "Neutral set");
    await user.click(screen.getByRole("button", { name: "Create research set" }));

    expect(await screen.findByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("Research set saved.");
    const submitted = action.mock.calls[0]?.[0] as FormData;
    expect([...submitted.keys()].sort()).toEqual(["idempotencyKey", "items", "label"]);
    expect([...submitted.keys()].join(" ")).not.toMatch(
      /owner|email|price|money|rate|discount|inventory|policy|hash/iu,
    );
  });

  it("associates the selection error summary and persistent quantity labels", async () => {
    const user = userEvent.setup();
    render(
      <SharedSetBuilder
        mode="create"
        products={products}
        idempotencyKey="task-7c2-builder-selection-0001"
        action={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Reference A quantity")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /Reference B/iu }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Research set needs attention");
    expect(alert).toHaveTextContent("Select 2 to 8 products.");
    expect(screen.getByRole("group", { name: "Current public products" })).toHaveAttribute(
      "aria-describedby",
      "create-new-selection-error",
    );
  });
});

describe("DeactivateSharedSetForm", () => {
  it("focuses mapped errors, announces success politely, and submits only replay authority", async () => {
    const user = userEvent.setup();
    const errorAction = vi.fn().mockResolvedValue({ state: "error", code: "unavailable", set: null });
    const { unmount } = render(
      <DeactivateSharedSetForm
        code="set_Task7C2Deactivate1"
        label="Neutral set"
        expectedUpdatedAt="2026-08-28T20:00:00.000Z"
        idempotencyKey="task-7c2-deactivate-error-0001"
        action={errorAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deactivate Neutral set" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent(/could not be deactivated safely/iu);
    expect(alert).not.toHaveTextContent("unavailable");
    const errorPayload = errorAction.mock.calls[0]?.[0] as FormData;
    expect([...errorPayload.keys()].sort()).toEqual(["code", "expectedUpdatedAt", "idempotencyKey"]);
    expect([...errorPayload.keys()].join(" ")).not.toMatch(/owner|email|money|rate|policy|hash/iu);
    unmount();

    const successAction = vi.fn().mockResolvedValue({
      state: "success",
      code: "deactivated",
      set: {
        code: "set_Task7C2Deactivate1",
        label: "Neutral set",
        active: false,
        itemCount: 2,
        updatedAt: "2026-08-28T20:00:01.000Z",
      },
    });
    render(
      <DeactivateSharedSetForm
        code="set_Task7C2Deactivate1"
        label="Neutral set"
        expectedUpdatedAt="2026-08-28T20:00:00.000Z"
        idempotencyKey="task-7c2-deactivate-success-0001"
        action={successAction}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Deactivate Neutral set" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Research set deactivated.");
  });
});
