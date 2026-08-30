import { DataLabel } from "@/components/design-system/archive-primitives";
import { ScienceField } from "@/components/site/science-field";

export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header
      className="site-page-intro relative isolate max-w-[78rem] overflow-hidden py-[var(--space-page-intro)]"
      data-motion-sequence="intro"
    >
      <ScienceField className="site-page-intro__field" variant="trace" />
      <div className="relative z-10 max-w-[72ch]">
        <div data-motion-step="1">
          <DataLabel>{eyebrow}</DataLabel>
        </div>
        <h1
          className="mt-5 max-w-[22ch] break-words text-balance font-heading text-page leading-[1.01] tracking-[-0.02em] text-ink"
          data-motion-step="2"
        >
          {title}
        </h1>
        <div className="mt-7 grid max-w-[72ch] gap-4 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-5">
          <span
            aria-hidden="true"
            className="mt-[0.9rem] h-px bg-moss"
            data-motion-step="3"
          />
          <p
            className="text-pretty text-lg leading-8 text-muted-ink"
            data-motion-step="4"
          >
            {description}
          </p>
        </div>
      </div>
    </header>
  );
}
