import Image from "next/image";

import { cn } from "@/lib/utils";

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
    <span className={cn("relative block aspect-[3/2] w-48", className)}>
      <Image
        alt={decorative ? "" : "PROPEPTIQ LABS"}
        className="object-contain"
        fill
        priority={priority}
        sizes="(min-width: 640px) 224px, 192px"
        src="/brand/propeptiq-logo.png"
      />
    </span>
  );
}
