import type { ApprovedWhyChooseItem } from "@/content/storefront-content";

export function WhyChoosePropeptIQ({
  items,
}: {
  items: readonly ApprovedWhyChooseItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section
      id="why-choose-propeptiq"
      aria-labelledby="why-choose-propeptiq-heading"
      className="border-t border-border bg-moss-soft/20 py-14 sm:py-16 lg:py-24"
    >
      <div className="site-container">
        <div className="grid gap-8 lg:grid-cols-[minmax(14rem,4fr)_minmax(0,8fr)] lg:gap-14">
          <header className="max-w-md">
            <p className="eyebrow">Storefront principles</p>
            <h2
              id="why-choose-propeptiq-heading"
              className="mt-4 text-balance font-heading text-section leading-[1.05] text-ink"
            >
              Why choose PropeptIQ
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-ink">
              A catalog experience built to keep product records, pricing states,
              and research-use boundaries clear at every step.
            </p>
          </header>
          <ul className="grid list-none gap-px overflow-hidden rounded-[0.875rem] border border-border bg-border p-0 md:grid-cols-2">
            {items.map((item, index) => (
              <li className="min-w-0 bg-surface-record p-6 sm:p-7" key={item.id}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-readable">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-6 font-heading text-2xl leading-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-7 text-muted-ink">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
