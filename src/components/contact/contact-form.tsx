"use client";

import { useRef, useState, type FormEvent } from "react";

import { contactLimits, type ContactField, type ContactResult } from "@/contact/contracts";

const fieldMessages: Record<ContactField, string> = {
  name: "Enter a name within the stated limit.",
  email: "Enter a valid email address.",
  subject: "Enter a subject within the stated limit.",
  message: "Enter a message within the stated limit.",
  orderReference: "Shorten the order reference.",
  request: "Review the form and try again.",
};

export function ContactForm() {
  const [state, setState] = useState<"idle" | "pending" | "success" | "failure">("idle");
  const [fieldError, setFieldError] = useState<ContactField | null>(null);
  const submitting = useRef(false);
  const submission = useRef<Readonly<{ requestId: string }> | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setState("pending");
    setFieldError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    submission.current ??= { requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(values.entries()),
          requestId: submission.current.requestId,
        }),
      });
      const result = await response.json() as ContactResult;
      if (response.ok && result.status === "ACCEPTED") {
        form.reset();
        submission.current = null;
        setState("success");
      } else {
        if (result.status === "INVALID") {
          setFieldError(result.field);
          if (result.field !== "request") {
            const invalidControl = form.elements.namedItem(result.field);
            if (invalidControl instanceof HTMLElement) invalidControl.focus();
          }
        }
        setState("failure");
      }
    } catch {
      setState("failure");
    } finally {
      submitting.current = false;
    }
  }

  const error = fieldError ? fieldMessages[fieldError] : null;
  const errorId = fieldError && fieldError !== "request"
    ? `contact-${fieldError}-error`
    : undefined;
  const describedBy = (field: ContactField) =>
    fieldError === field ? errorId : undefined;
  const control = "mt-2 min-h-11 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-ink outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20";
  return (
    <form
      className="record-card space-y-5"
      onChange={() => { submission.current = null; }}
      onInput={() => { submission.current = null; }}
      onSubmit={submit}
      noValidate
    >
      <div>
        <label htmlFor="contact-name" className="font-semibold">Name</label>
        <input id="contact-name" name="name" required maxLength={contactLimits.name} autoComplete="name" className={control} aria-invalid={fieldError === "name"} aria-describedby={describedBy("name")} />
      </div>
      <div>
        <label htmlFor="contact-email" className="font-semibold">Email</label>
        <input id="contact-email" name="email" type="email" required maxLength={contactLimits.email} autoComplete="email" className={control} aria-invalid={fieldError === "email"} aria-describedby={describedBy("email")} />
      </div>
      <div>
        <label htmlFor="contact-subject" className="font-semibold">Subject</label>
        <input id="contact-subject" name="subject" required maxLength={contactLimits.subject} className={control} aria-invalid={fieldError === "subject"} aria-describedby={describedBy("subject")} />
      </div>
      <div>
        <label htmlFor="contact-order-reference" className="font-semibold">Order reference <span className="font-normal">(optional)</span></label>
        <input id="contact-order-reference" name="orderReference" maxLength={contactLimits.orderReference} className={control} aria-invalid={fieldError === "orderReference"} aria-describedby={describedBy("orderReference")} />
      </div>
      <div>
        <label htmlFor="contact-message" className="font-semibold">Message</label>
        <textarea id="contact-message" name="message" required maxLength={contactLimits.message} rows={7} className={control} aria-invalid={fieldError === "message"} aria-describedby={describedBy("message")} />
      </div>
      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" maxLength={contactLimits.honeypot} />
      </div>
      {error ? <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p> : null}
      {state === "success" ? <p role="status" className="text-sm text-accent-readable">Your message was accepted for delivery. We’ll reply by email.</p> : null}
      {state === "failure" && !error ? <p role="alert" className="text-sm text-red-700">We couldn’t accept your message. Please try again later.</p> : null}
      <button type="submit" className="action-primary min-h-11 rounded-full px-6 py-2.5 font-semibold" disabled={state === "pending"}>
        {state === "pending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
