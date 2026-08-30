"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ShellNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export const ShellNavLink = forwardRef<HTMLAnchorElement, ShellNavLinkProps>(function ShellNavLink({
  href,
  children,
  className,
  ...props
}, ref) {
  const pathname = usePathname();
  const current =
    pathname === href ||
    (href !== "/" && href !== "/account" && Boolean(pathname?.startsWith(`${href}/`)));
  return (
    <Link
      {...props}
      ref={ref}
      href={href as never}
      className={cn("shell-nav-link", className)}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </Link>
  );
});
