"use client";

import { Menu, UserRound } from "lucide-react";
import Link from "next/link";

import { SIGN_IN_ROUTE } from "@/auth/routes";
import { useCart } from "@/cart/cart-provider";
import { CartDrawer } from "@/components/commerce/cart-drawer";
import { BrandLogo } from "@/components/site/brand-mark";
import { HeaderBrandMotion } from "@/components/site/header-brand-motion";
import { ResearchRestrictionBar } from "@/components/site/research-restriction-bar";
import { ShellNavLink } from "@/components/site/shell-nav-link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  publicNavigation,
  researchRestrictions,
  siteName,
} from "@/lib/site-content";

export function SiteHeader({ cartDrawer = false }: Readonly<{ cartDrawer?: boolean }>) {
  const { itemCount } = useCart();

  return (
    <header className="persistent-chrome">
      <ResearchRestrictionBar />
      <div className="border-b border-border bg-canvas">
        <div className="site-container flex min-h-[4.75rem] items-center gap-2 py-2 sm:gap-3">
          <Link
            href="/"
            aria-label={`${siteName} home`}
            className="group flex min-h-11 shrink-0 items-center rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
          >
            <HeaderBrandMotion>
              <BrandLogo
                className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 motion-reduce:transform-none"
                decorative
                priority
              />
            </HeaderBrandMotion>
          </Link>

          <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 xl:flex">
            {publicNavigation.map((item) => (
              <ShellNavLink
                key={item.href}
                href={item.href}
                className="px-3 py-3 text-sm text-muted-ink hover:bg-moss-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </ShellNavLink>
            ))}
          </nav>

          <CartDrawer enabled={cartDrawer} itemCount={itemCount} />

          <Link
            href={SIGN_IN_ROUTE}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
          >
            <UserRound aria-hidden="true" className="size-4" />
            <span>Sign in</span>
          </Link>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Open navigation"
                className="size-11 rounded-full border-ink/20 bg-transparent text-ink hover:bg-moss-soft/60 xl:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(24rem,calc(100vw-1rem))] border-border bg-canvas p-0"
            >
              <SheetHeader className="border-b border-border px-6 pb-5 pt-6 text-left">
                <div className="flex items-center pr-10">
                  <BrandLogo decorative />
                  <SheetTitle className="sr-only">{siteName}</SheetTitle>
                </div>
                <SheetDescription className="pt-4 leading-6 text-muted-ink">
                  {researchRestrictions[0]} {researchRestrictions[1]}
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile primary" className="flex flex-col px-3 py-4">
                {publicNavigation.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <ShellNavLink
                      href={item.href}
                      className="flex min-h-12 rounded-xl px-3 py-3 text-ink hover:bg-moss-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.label}
                    </ShellNavLink>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link
                    href="/cart"
                    className="flex min-h-12 items-center justify-between rounded-xl px-3 py-3 font-medium text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>Cart</span>
                    <span>{itemCount}</span>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href={SIGN_IN_ROUTE}
                    className="flex min-h-12 items-center rounded-xl px-3 py-3 font-medium text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Sign in
                  </Link>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
