import type { ApprovedFaqEntry } from "@/content/storefront-content";

export function FaqSection({
  entries,
}: {
  entries: readonly ApprovedFaqEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="border-t border-border py-14 sm:py-16 lg:py-24"
    >
      <div className="site-container grid gap-8 lg:grid-cols-[minmax(14rem,4fr)_minmax(0,8fr)] lg:gap-14">
        <header className="max-w-md">
          <p className="eyebrow">Quick reference</p>
          <h2
            id="faq-heading"
            className="mt-4 text-balance font-heading text-section leading-[1.05] text-ink"
          >
            Frequently Asked Questions
          </h2>
          <p className="mt-5 text-base leading-7 text-muted-ink">
            Answers about catalog browsing, product selection, quantity pricing,
            and research-use boundaries.
          </p>
        </header>
        <div className="grid content-start gap-3">
          {entries.map((entry) => (
            <details
              className="record-sheet group overflow-hidden p-0"
              id={entry.anchor}
              key={entry.id}
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-ink marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss">
                <span>{entry.question}</span>
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-lg leading-none transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="border-t border-border bg-moss-soft/20 px-5 py-5 text-base leading-7 text-muted-ink">
                {entry.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
