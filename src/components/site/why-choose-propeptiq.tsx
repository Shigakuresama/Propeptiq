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
      className="border-t border-border bg-moss-soft/20 py-14 lg:py-16"
    >
      <div className="site-container">
        <h2
          id="why-choose-propeptiq-heading"
          className="font-heading text-3xl text-ink sm:text-4xl"
        >
          Why choose PropeptIQ
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li className="record-sheet min-w-0 p-6" key={item.id}>
              <h3 className="font-heading text-2xl text-ink">{item.title}</h3>
              <p className="mt-3 text-base leading-7 text-muted-ink">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
