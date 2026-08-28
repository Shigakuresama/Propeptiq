import { Sparkles } from "lucide-react";
import Link from "next/link";

import type { LoyaltyPolicy } from "@/domain/rewards";

export function ProgramStrip({
  loyaltyPolicy,
}: Readonly<{ loyaltyPolicy: LoyaltyPolicy | null }>) {
  if (loyaltyPolicy?.status !== "active") return null;

  return (
    <section
      aria-label="Active rewards program"
      className="border-b border-border bg-moss-soft/55"
    >
      <div className="site-container flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-base text-ink">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-moss" />
        <p>Earn {loyaltyPolicy.pointsPerDollar} points per eligible dollar.</p>
        <Link
          className="inline-flex min-h-11 items-center font-semibold underline decoration-moss underline-offset-4 transition-colors duration-200 hover:text-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/rewards"
        >
          View rewards
        </Link>
      </div>
    </section>
  );
}
