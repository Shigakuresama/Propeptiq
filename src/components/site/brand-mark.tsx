import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-ink/15 bg-canvas",
        className,
      )}
    >
      <span className="absolute h-px w-5 rotate-45 bg-moss" />
      <span className="absolute h-px w-5 -rotate-45 bg-moss" />
      <span className="size-1.5 rounded-full bg-ink" />
    </span>
  );
}
