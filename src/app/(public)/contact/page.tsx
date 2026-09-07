import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact | PROPEPTIQ Labs",
  description: "Contact PROPEPTIQ Labs with a research product or order question.",
};

export default function ContactPage() {
  return (
    <section className="site-container py-12 sm:py-16" aria-labelledby="contact-heading">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow text-accent-readable">Support</p>
        <h1 id="contact-heading" className="mt-3 font-heading text-page text-ink">
          Contact us
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-ink">
          Send a question about catalog records, research materials, or an existing order. Include an order reference when it helps us locate the record.
        </p>
        <div className="mt-8"><ContactForm /></div>
      </div>
    </section>
  );
}
