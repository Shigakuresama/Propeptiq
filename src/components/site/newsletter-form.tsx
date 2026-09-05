"use client";

import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  isNewsletterPrivacyLinkView,
  type NewsletterPrivacyLinkView,
} from "@/lib/site-content";
import {
  parseNewsletterResult,
  parseNewsletterSubscriptionInput,
  type NewsletterSubscriptionInput,
} from "@/newsletter/contracts";

export type NewsletterSubmit = (
  input: NewsletterSubscriptionInput,
) => Promise<unknown>;

const loadingMessage = "Subscribing…";
const invalidEmailMessage = "Enter a valid email address.";
const missingConsentMessage = "Consent is required to subscribe.";
const subscribedMessage = "You're subscribed to PropeptIQ updates.";
const duplicateMessage = "This email is already subscribed.";
const unavailableMessage = "Newsletter signup is temporarily unavailable.";
const genericErrorMessage =
  "Newsletter signup could not be completed. Please try again later.";

async function submitNewsletter(
  input: NewsletterSubscriptionInput,
): Promise<unknown> {
  const response = await fetch("/api/newsletter", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: input.email, consent: true }),
  });
  const parsed = parseNewsletterResult(await response.json());
  if (parsed === null) throw new TypeError("Newsletter response was invalid.");
  if (
    !response.ok &&
    (parsed.status === "SUBSCRIBED" || parsed.status === "DUPLICATE")
  ) {
    throw new TypeError("Newsletter request failed.");
  }
  return parsed;
}

function messageForResult(value: unknown): string {
  const result = parseNewsletterResult(value);
  if (result === null) return genericErrorMessage;
  if (result.status === "SUBSCRIBED") return subscribedMessage;
  if (result.status === "DUPLICATE") return duplicateMessage;
  if (result.status === "NEWSLETTER_NOT_CONFIGURED") return unavailableMessage;
  return genericErrorMessage;
}

export function NewsletterForm({
  available,
  presentation = "default",
  privacyHref,
  submit = submitNewsletter,
}: {
  available: boolean;
  presentation?: "default" | "footer" | undefined;
  privacyHref: NewsletterPrivacyLinkView | null;
  submit?: NewsletterSubmit | undefined;
}) {
  const privacyLink = isNewsletterPrivacyLinkView(privacyHref)
    ? privacyHref
    : null;
  const unavailable = available !== true || privacyLink === null;
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [invalidField, setInvalidField] = useState<"email" | "consent" | null>(null);
  const visibleStatus = unavailable ? unavailableMessage : status;
  const inFooter = presentation === "footer";

  function announceInvalid(field: "email" | "consent"): void {
    setInvalidField(field);
    setStatus(field === "email" ? invalidEmailMessage : missingConsentMessage);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (unavailable || inFlight.current) return;

    const fields = new FormData(event.currentTarget);
    const parsed = parseNewsletterSubscriptionInput({
      email: fields.get("email"),
      consent: fields.get("consent") === "on",
    });
    if (!parsed.success) {
      if (parsed.result.field === "email") announceInvalid("email");
      else if (parsed.result.field === "consent") announceInvalid("consent");
      else setStatus(genericErrorMessage);
      return;
    }

    inFlight.current = true;
    setInvalidField(null);
    setLoading(true);
    setStatus(loadingMessage);
    try {
      setStatus(messageForResult(await submit(parsed.data)));
    } catch {
      setStatus(genericErrorMessage);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="newsletter-heading"
      className={inFooter
        ? "newsletter-form--footer border-t border-canvas/20 py-10 lg:py-12"
        : "border-t border-border bg-moss-soft/20 py-14 lg:py-16"}
      data-presentation={presentation}
    >
      <div className={inFooter
        ? "grid min-w-0 gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start"
        : "site-container grid gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start"}
      >
        <div className="min-w-0 max-w-[36rem]">
          <p className={inFooter ? "eyebrow text-canvas/70" : "eyebrow"}>Newsletter</p>
          <h2
            id="newsletter-heading"
            className={`mt-3 font-heading text-3xl sm:text-4xl ${inFooter ? "text-canvas" : "text-ink"}`}
          >
            PropeptIQ newsletter
          </h2>
          <p className={`mt-4 text-base leading-7 ${inFooter ? "text-canvas/75" : "text-muted-ink"}`}>
            Subscribe to receive PropeptIQ newsletter emails.
          </p>
        </div>

        <form
          aria-label="Newsletter signup"
          className={inFooter
            ? "newsletter-form__fields--footer grid min-w-0 gap-5 rounded-[0.875rem] border border-canvas/25 bg-canvas/[0.06] p-5 sm:p-6"
            : "record-sheet grid gap-5 p-5 sm:p-6"}
          onSubmit={(event) => { void handleSubmit(event); }}
        >
          <label
            className={`grid min-w-0 gap-2 text-sm font-semibold ${inFooter ? "text-canvas" : "text-ink"}`}
            htmlFor="newsletter-email"
          >
            Email address
            <input
              aria-invalid={invalidField === "email" || undefined}
              autoComplete="email"
              className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-canvas px-3 text-base font-normal text-ink outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={unavailable || loading}
              id="newsletter-email"
              maxLength={254}
              name="email"
              onInvalid={(event) => {
                event.preventDefault();
                announceInvalid("email");
              }}
              required
              type="email"
            />
          </label>

          <label className={`flex min-w-0 items-start gap-3 text-sm leading-6 ${inFooter ? "text-canvas/75" : "text-muted-ink"}`}>
            <input
              aria-invalid={invalidField === "consent" || undefined}
              className="mt-0.5 size-5 shrink-0 accent-moss focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={unavailable || loading}
              name="consent"
              onInvalid={(event) => {
                event.preventDefault();
                announceInvalid("consent");
              }}
              required
              type="checkbox"
            />
            <span>
              {privacyLink === null ? (
                "Newsletter consent is unavailable until an approved privacy policy is configured."
              ) : (
                <>
                  I consent to receive PropeptIQ newsletter emails. Review the{" "}
                  <a
                    className={inFooter
                      ? "rounded-sm text-canvas underline decoration-canvas/50 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
                      : "record-link"}
                    href={privacyLink.href}
                  >
                    Privacy Policy
                  </a>.
                </>
              )}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              className={`${inFooter ? "action-inverse" : "action-primary"} min-h-11 px-5`}
              disabled={unavailable || loading}
              type="submit"
            >
              {loading ? loadingMessage : "Subscribe"}
            </Button>
            <p
              aria-atomic="true"
              aria-live="polite"
              className={`min-h-6 min-w-0 flex-1 text-sm leading-6 ${inFooter ? "text-canvas/75" : "text-muted-ink"}`}
              role="status"
            >
              {visibleStatus}
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}
