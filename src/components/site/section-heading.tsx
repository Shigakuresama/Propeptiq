import { DataLabel } from "@/components/design-system/archive-primitives";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("max-w-[72ch]", className)}>
      <DataLabel>{eyebrow}</DataLabel>
      <h2
        className="mt-4 max-w-[24ch] break-words text-balance font-heading text-section leading-[1.06] tracking-[-0.015em] text-ink"
        id={id}
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-5 max-w-[64ch] text-pretty text-base leading-7 text-muted-ink">
          {description}
        </p>
      ) : null}
    </div>
  );
}
