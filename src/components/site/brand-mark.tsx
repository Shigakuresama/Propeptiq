import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block size-10 shrink-0 overflow-hidden",
        className,
      )}
    >
      <Image
        alt=""
        className="object-cover object-[50%_30%] scale-[2.1]"
        fill
        sizes="40px"
        src="/brand/propeptiq-logo.png"
      />
    </span>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("relative block aspect-[3/2] w-48", className)}>
      <Image
        alt="PROPEPTIQ LABS"
        className="object-contain"
        fill
        sizes="(min-width: 640px) 224px, 192px"
        src="/brand/propeptiq-logo.png"
      />
    </span>
  );
}
