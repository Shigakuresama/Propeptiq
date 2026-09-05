import { Calculator, ClipboardList, FlaskConical, Layers, LibraryBig, Search } from "lucide-react";

import type { ApprovedWhyChooseItem } from "@/content/storefront-content";

const icons = {
  "owner-supplied-records": LibraryBig,
  "clear-purchase-states": ClipboardList,
  "exact-variant-identity": Layers,
  "visible-quantity-pricing": Calculator,
  "shared-search-index": Search,
  "research-use-boundary": FlaskConical,
} as const;

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
      className="scroll-mt-32 border-t border-border bg-moss-soft/20 py-14 sm:py-16 lg:py-24"
    >
      <div className="site-container">
        <div className="grid gap-8 lg:gap-12">
          <header className="max-w-2xl">
            <p className="eyebrow">Clarity at every step</p>
            <h2
              id="why-choose-propeptiq-heading"
              className="mt-4 text-balance font-heading text-section leading-[1.05] text-ink"
            >
              Why choose PropeptIQ
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-ink">
              Clear product information, straightforward selection, and pricing
              you can compare as you browse.
            </p>
          </header>
          <ul className="grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const Icon = Object.hasOwn(icons, item.id)
                ? icons[item.id as keyof typeof icons]
                : LibraryBig;
              return (
                <li className="record-card min-w-0 bg-surface-record p-6 [overflow-wrap:anywhere] sm:p-7" key={item.id}>
                  <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-moss-soft/30 text-accent-readable">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-6 font-heading text-2xl leading-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-muted-ink">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
