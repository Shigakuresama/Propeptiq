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
    <span aria-hidden="true" className={cn("relative block size-10 shrink-0 overflow-visible", className)}>
      <Image
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        height={1024}
        priority={priority}
        sizes="40px"
        src="/brand/propeptiq-logo.png"
        width={1536}
      />
    </span>
  );
}

export function BrandLogo({
  className,
  decorative = false,
  priority = false,
}: {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}) {
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <BrandMark className="size-9 sm:size-10" priority={priority} />
      <span className="flex flex-col leading-none text-ink">
        <span className="font-heading text-lg font-semibold tracking-[0.08em] sm:text-xl">
          PROPEPTIQ
        </span>
        <span className="mt-1 text-[0.56rem] font-semibold tracking-[0.32em] text-muted-ink">
          LABS
        </span>
      </span>
    </span>
  );
}
