"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ShellNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || (href !== "/account" && pathname.startsWith(`${href}/`));
  return (
    <Link href={href as never} className="shell-nav-link" aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
