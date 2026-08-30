import { DataLabel } from "@/components/design-system/archive-primitives";

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
    <header className="max-w-[78rem] py-[var(--space-page-intro)]">
      <DataLabel>{eyebrow}</DataLabel>
      <h1 className="mt-5 max-w-[22ch] break-words text-balance font-heading text-page leading-[1.01] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <div className="mt-7 grid max-w-[72ch] gap-4 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-5">
        <span aria-hidden="true" className="mt-[0.9rem] h-px bg-moss" />
        <p className="text-pretty text-lg leading-8 text-muted-ink">{description}</p>
      </div>
    </header>
  );
}
