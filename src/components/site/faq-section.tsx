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
      className="border-t border-border py-14 lg:py-16"
    >
      <div className="site-container">
        <h2
          id="faq-heading"
          className="font-heading text-3xl text-ink sm:text-4xl"
        >
          Frequently Asked Questions
        </h2>
        <div className="mt-8 grid gap-3">
          {entries.map((entry) => (
            <details
              className="record-sheet group p-0"
              id={entry.anchor}
              key={entry.id}
            >
              <summary className="flex min-h-11 cursor-pointer items-center px-5 py-4 font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                {entry.question}
              </summary>
              <p className="border-t border-border px-5 py-4 text-base leading-7 text-muted-ink">
                {entry.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
