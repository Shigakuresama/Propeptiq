import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  projectApprovedNewsletterPrivacyHref,
  projectNewsletterPrivacyLinkView,
} from "@/lib/site-content";

import { NewsletterForm, type NewsletterSubmit } from "./newsletter-form";

const fictionalEmail = "subscriber@example.test";
const fictionalPrivacyHref = projectApprovedNewsletterPrivacyHref(
  "/test-only-fictional-privacy",
  Object.freeze(["/test-only-fictional-privacy"]),
)!;
const fictionalPrivacyLinkView = projectNewsletterPrivacyLinkView(
  fictionalPrivacyHref,
)!;
const forgedPrivacyHref = Object.freeze({
  href: "/privacy-policy",
  kind: "approved-newsletter-privacy-href",
}) as never;
const clonedFictionalPrivacyHref = JSON.parse(
  JSON.stringify(fictionalPrivacyHref),
) as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function fillConfiguredForm(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(screen.getByRole("textbox", { name: "Email address" }), fictionalEmail);
  await user.click(screen.getByRole("checkbox"));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NewsletterForm", () => {
  it("keeps an approved privacy destination usable after the server-to-client serialization boundary", () => {
    const serializedPrivacyHref = JSON.parse(
      JSON.stringify(fictionalPrivacyLinkView),
    ) as typeof fictionalPrivacyLinkView;

    render(
      <NewsletterForm
        available
        privacyHref={serializedPrivacyHref}
        submit={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Email address" })).toBeEnabled();
    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      fictionalPrivacyHref.href,
    );
  });

  it("renders the native email and unchecked consent contract with one live region", () => {
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={vi.fn()} />);

    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("maxlength", "254");
    expect(email).toBeRequired();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeRequired();
    const privacy = screen.getByRole("link", { name: "Privacy Policy" });
    expect(privacy).toHaveAttribute("href", "/test-only-fictional-privacy");
    expect(privacy.closest("label")).toHaveTextContent(
      "I consent to receive PropeptIQ newsletter emails. Review the Privacy Policy.",
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute("aria-live", "polite");
    expect(statuses[0]).toHaveAttribute("aria-atomic", "true");
  });

  it("stays visible, disabled, and honest when production privacy configuration is null", async () => {
    const user = userEvent.setup();
    const submit = vi.fn<NewsletterSubmit>();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<NewsletterForm available privacyHref={null} submit={submit} />);

    expect(screen.getByRole("heading", { name: "PropeptIQ newsletter" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Newsletter signup is temporarily unavailable.",
    );

    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(submit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails a safe-looking but unbranded runtime href closed without rendering a link", () => {
    render(
      <NewsletterForm
        available
        privacyHref={"/test-only-fictional-privacy" as never}
        submit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Newsletter signup is temporarily unavailable.",
    );
  });

  it.each([
    ["forged plain object", forgedPrivacyHref],
    ["JSON-cloned projected object", clonedFictionalPrivacyHref],
  ] as const)("fails a %s closed without link, submit, or fetch", async (_label, privacyHref) => {
    const user = userEvent.setup();
    const submit = vi.fn<NewsletterSubmit>();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<NewsletterForm available privacyHref={privacyHref} submit={submit} />);

    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Newsletter signup is temporarily unavailable.",
    );
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(submit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("announces an invalid email and does not submit", async () => {
    const user = userEvent.setup();
    const submit = vi.fn<NewsletterSubmit>();
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={submit} />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "not-an-email");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(screen.getByRole("status")).toHaveTextContent("Enter a valid email address.");
    expect(submit).not.toHaveBeenCalled();
  });

  it("announces missing consent and does not submit", async () => {
    const user = userEvent.setup();
    const submit = vi.fn<NewsletterSubmit>();
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={submit} />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), fictionalEmail);
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Consent is required to subscribe.",
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("locks duplicate submission while one request is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<unknown>();
    const submit = vi.fn<NewsletterSubmit>().mockReturnValue(pending.promise);
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={submit} />);
    await fillConfiguredForm(user);

    const button = screen.getByRole("button", { name: "Subscribe" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Subscribing…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Subscribing…");
    fireEvent.submit(button.closest("form")!);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ email: fictionalEmail, consent: true });

    await act(async () => {
      pending.resolve({ status: "SUBSCRIBED" });
      await pending.promise;
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're subscribed to PropeptIQ updates.",
    );
  });

  it.each([
    [{ status: "SUBSCRIBED" }, "You're subscribed to PropeptIQ updates."],
    [{ status: "DUPLICATE" }, "This email is already subscribed."],
    [{ status: "NEWSLETTER_NOT_CONFIGURED" }, "Newsletter signup is temporarily unavailable."],
    [{ status: "PROVIDER_ERROR" }, "Newsletter signup could not be completed. Please try again later."],
    [{ status: "INVALID", field: "request" }, "Newsletter signup could not be completed. Please try again later."],
  ] as const)("maps strict result $0 to fixed copy", async (result, message) => {
    const user = userEvent.setup();
    const submit = vi.fn<NewsletterSubmit>().mockResolvedValue(result);
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={submit} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it.each([
    ["extra-key response", async () => ({ status: "SUBSCRIBED", provider: "test-only" })],
    ["unknown response", async () => ({ status: "UNKNOWN" })],
    ["synchronous throw", () => { throw new Error("test-only submit error"); }],
    ["rejection", async () => { throw new Error("test-only submit rejection"); }],
  ] as const)("shows only the generic error for %s", async (_label, implementation) => {
    const user = userEvent.setup();
    const submit = vi.fn(implementation) as NewsletterSubmit;
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={submit} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Newsletter signup could not be completed. Please try again later.",
    );
    expect(screen.queryByText("You're subscribed to PropeptIQ updates.")).toBeNull();
    expect(screen.getByRole("status")).not.toHaveTextContent(fictionalEmail);
  });

  it("uses the exact same-origin JSON request and accepts only a strict successful response", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: "SUBSCRIBED" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchSpy);
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [path, init] = fetchSpy.mock.calls[0]!;
    expect(path).toBe("/api/newsletter");
    expect(path).not.toContain("?");
    expect(init).toEqual({
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: fictionalEmail, consent: true }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're subscribed to PropeptIQ updates.",
    );
  });

  it("preserves the honest unavailable state for a typed non-OK closed response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: "NEWSLETTER_NOT_CONFIGURED" }),
      { status: 503 },
    )));
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Newsletter signup is temporarily unavailable.",
    );
  });

  it.each([
    ["invalid JSON", new Response("not-json", { status: 200 })],
    ["malformed JSON result", new Response(JSON.stringify({ status: "SUBSCRIBED", email: fictionalEmail }), { status: 200 })],
    ["non-OK success result", new Response(JSON.stringify({ status: "SUBSCRIBED" }), { status: 503 })],
    ["typed provider error", new Response(JSON.stringify({ status: "PROVIDER_ERROR" }), { status: 503 })],
    ["typed invalid result", new Response(JSON.stringify({ status: "INVALID", field: "request" }), { status: 400 })],
  ] as const)("maps default fetch %s to the generic error", async (_label, response) => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Newsletter signup could not be completed. Please try again later.",
    );
  });

  it("maps a default transport rejection to the fixed generic error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new Error(`network leaked ${fictionalEmail}`),
    ));
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Newsletter signup could not be completed. Please try again later.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(fictionalEmail);
  });

  it("does not write storage, cookies, or logs during default submission", async () => {
    const user = userEvent.setup();
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const initialCookie = document.cookie;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: "SUBSCRIBED" }),
      { status: 200 },
    )));
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} />);
    await fillConfiguredForm(user);

    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    await screen.findByText("You're subscribed to PropeptIQ updates.");

    expect(localWrite).not.toHaveBeenCalled();
    expect(document.cookie).toBe(initialCookie);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("contains only the supplied approved privacy destination in the consent area", () => {
    render(<NewsletterForm available privacyHref={fictionalPrivacyLinkView} submit={vi.fn()} />);
    const form = screen.getByRole("form", { name: "Newsletter signup" });
    const links = within(form).getAllByRole("link");

    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", fictionalPrivacyHref.href);
  });

  it("keeps a privacy-approved form disabled when the shared launch flag is false", async () => {
    const user = userEvent.setup();
    const submit = vi.fn<NewsletterSubmit>();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <NewsletterForm
        available={false}
        privacyHref={fictionalPrivacyLinkView}
        submit={submit}
      />,
    );

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      fictionalPrivacyHref.href,
    );
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Newsletter signup is temporarily unavailable.",
    );

    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(submit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
