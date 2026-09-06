"use client";

import { Coins, FlaskConical, Handshake, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const programs = [
  { label: "Rewards", publicHref: "/rewards", accountHref: "/account/rewards", Icon: Coins },
  { label: "Referrals", publicHref: "/rewards#referrals", accountHref: "/account/referrals", Icon: FlaskConical },
  { label: "Research sets", publicHref: "/research-sets", accountHref: "/research-sets", Icon: Share2 },
  { label: "Partner Program", publicHref: "/partners", accountHref: "/account/partner", Icon: Handshake },
] as const;

export function GrowthNavigation({ account = false }: { account?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="PROPEPTIQ programs" className="growth-navigation">
      {programs.map(({ label, publicHref, accountHref, Icon }) => {
        const href = account ? accountHref : publicHref;
        return <Link key={label} href={href} aria-current={pathname === href ? "page" : undefined}>
          <Icon aria-hidden="true" className="size-4" />{label}
        </Link>;
      })}
    </nav>
  );
}
