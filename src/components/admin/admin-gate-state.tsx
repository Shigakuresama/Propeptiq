import Link from "next/link";

import type { AdminGate } from "@/admin/access";

const copy: Record<Exclude<AdminGate, { allowed: true }>["code"], { title: string; detail: string }> = {
  signed_out: { title: "Administrator sign-in required", detail: "No authenticated server identity is available." },
  email_unverified: { title: "Verified staff email required", detail: "The current primary email is missing, malformed, unverified, or future-dated." },
  identity_missing: { title: "Application identity unavailable", detail: "The signed-in identity has no matching application principal or the database is unavailable." },
  blocked: { title: "Blocked accounts cannot administer", detail: "This account retains only its own account and order reads." },
  mfa_not_configured: { title: "Multi-factor authentication is not configured", detail: "Configure MFA with the identity provider before using administration." },
  second_factor_missing: { title: "Complete a second factor for this session", detail: "MFA is configured, but the current session has no completed second factor." },
  capability_missing: { title: "Required capability is not granted", detail: "Capabilities are read from active application staff records, never from the browser." },
};

export function AdminGateState({ gate, inline = false }: { gate: Exclude<AdminGate, { allowed: true }>; inline?: boolean }) {
  const message = copy[gate.code];
  if (inline) {
    return (
      <section className="error-record" role="alert">
        <p className="eyebrow">Resource access closed</p>
        <h1 className="mt-4 font-heading text-page leading-[0.95]">{message.title}</h1>
        <p className="mt-5 text-base leading-7">{message.detail}</p>
      </section>
    );
  }
  return (
    <main id="main-content" className="site-container py-16" tabIndex={-1}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <section className="error-record mx-auto max-w-3xl" role="alert">
        <p className="eyebrow">Administration closed</p>
        <h1 className="mt-4 font-heading text-page leading-[0.95]">{message.title}</h1>
        <p className="mt-5 text-base leading-7">{message.detail}</p>
        {gate.code === "signed_out" ? <Link href="/sign-in" className="record-link mt-6 inline-flex min-h-11 items-center">Sign in</Link> : null}
      </section>
    </main>
  );
}
