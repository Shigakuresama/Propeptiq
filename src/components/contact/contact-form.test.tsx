import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ContactForm } from "@/components/contact/contact-form";

function fill() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.test" } });
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Question" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
}

describe("ContactForm", () => {
  it("has accessible bounded controls and an optional order reference", () => {
    render(<ContactForm />);
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/Order reference/)).not.toBeRequired();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("guards duplicate clicks and reports accepted delivery", async () => {
    let resolve!: (value: Response | PromiseLike<Response>) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((done) => { resolve = done; }) as Promise<Response>);
    render(<ContactForm />); fill(); const form = screen.getByRole("button").closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    resolve({ ok: true, json: async () => ({ status: "ACCEPTED" }) } as Response);
    expect(await screen.findByRole("status")).toHaveTextContent("accepted for delivery");
    fetchMock.mockRestore();
  });

  it("shows a field error returned by the server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, json: async () => ({ status: "INVALID", field: "email" }) } as Response);
    render(<ContactForm />); fill(); fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("valid email"));
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "contact-email-error");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "contact-email-error");
    expect(email).toHaveFocus();
    fetchMock.mockRestore();
  });

  it.each([
    { status: "ACCEPTED" },
    { status: "UNAVAILABLE" },
    { status: "INVALID", field: "email" },
  ] as const)("clears settled $status feedback when the visitor edits the form", async (result) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: result.status === "ACCEPTED",
      json: async () => result,
    } as Response);
    render(<ContactForm />);
    fill();
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await screen.findByRole(result.status === "ACCEPTED" ? "status" : "alert");

    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "updated@example.test" } });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(email).toHaveAttribute("aria-invalid", "false");
    expect(email).not.toHaveAttribute("aria-describedby");
    fetchMock.mockRestore();
  });

  it.each(["ACCEPTED", "UNAVAILABLE"] as const)
  ("prevents edits during delivery and enables fields again after %s", async (status) => {
    const user = userEvent.setup();
    let resolve!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    render(<ContactForm />);
    fill();
    const form = screen.getByRole("button").closest("form")!;
    const message = screen.getByLabelText("Message");
    const controls = form.querySelectorAll("input, textarea");

    fireEvent.submit(form);
    for (const control of controls) expect(control).toBeDisabled();
    await user.type(message, " Additional unsent details");
    expect(message).toHaveValue("Hello");
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { message: string };
    expect(payload.message).toBe("Hello");

    resolve({ ok: status === "ACCEPTED", json: async () => ({ status }) } as Response);
    await screen.findByRole(status === "ACCEPTED" ? "status" : "alert");
    for (const control of controls) expect(control).toBeEnabled();
    expect(message).toHaveValue(status === "ACCEPTED" ? "" : "Hello");
    fetchMock.mockRestore();
  });

  it("reuses a submission UUID for retries and rotates it after edits or acceptance", async () => {
    let call = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      return {
        ok: call === 3,
        json: async () => call === 3
          ? { status: "ACCEPTED" }
          : { status: "UNAVAILABLE" },
      } as Response;
    });
    render(<ContactForm />);
    fill();
    const form = screen.getByRole("button").closest("form")!;

    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { requestId: string };
    const retry = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { requestId: string };
    expect(retry.requestId).toBe(first.requestId);
    expect(first.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Changed" } });
    fireEvent.submit(form);
    await screen.findByRole("status");
    const changed = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as { requestId: string };
    expect(changed.requestId).not.toBe(first.requestId);

    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const afterAccepted = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body)) as { requestId: string };
    expect(afterAccepted.requestId).not.toBe(changed.requestId);
    fetchMock.mockRestore();
  });
});
