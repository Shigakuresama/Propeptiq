import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-[68ch]", className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-balance font-heading text-section leading-[1.08] text-ink">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 max-w-[68ch] text-pretty leading-7 text-muted-ink">
          {description}
        </p>
      ) : null}
    </div>
  );
}
