import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  priority = false,
}: {
  className?: string | undefined;
  priority?: boolean | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("brand-logo__mark relative block aspect-square size-10 shrink-0", className)}
    >
      <Image
        alt=""
        className="object-contain"
        fill
        preload={priority}
        sizes="40px"
        src="/brand/propeptiq-mark.png"
      />
    </span>
  );
}

export type BrandLogoTone = "default" | "inverse";

export function BrandLogo({
  className,
  decorative = false,
  priority = false,
  tone = "default",
}: {
  className?: string | undefined;
  decorative?: boolean | undefined;
  priority?: boolean | undefined;
  tone?: BrandLogoTone | undefined;
}) {
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      className={cn("brand-logo inline-flex min-w-0 items-center gap-2", className)}
    >
      <BrandMark className="size-9 sm:size-10" priority={priority} />
      <span
        className={cn(
          "brand-logo__wordmark flex min-w-0 flex-col leading-none",
          tone === "inverse" ? "text-canvas" : "text-ink",
        )}
      >
        <span className="whitespace-nowrap font-heading text-lg font-semibold tracking-[0.08em] sm:text-xl">
          PROPEPTIQ
        </span>
        <span
          className={cn(
            "mt-1 whitespace-nowrap text-[0.56rem] font-semibold tracking-[0.32em]",
            tone === "inverse" ? "text-canvas/70" : "text-muted-ink",
          )}
        >
          LABS
        </span>
      </span>
    </span>
  );
}
