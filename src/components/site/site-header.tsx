"use client";

import { Menu, ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";

import { useCart } from "@/cart/cart-provider";
import { BrandMark } from "@/components/site/brand-mark";
import { ResearchRestrictionBar } from "@/components/site/research-restriction-bar";
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

export function SiteHeader() {
  const { itemCount } = useCart();

  return (
    <header className="persistent-chrome">
      <ResearchRestrictionBar />
      <div className="border-b border-border bg-canvas">
        <div className="site-container flex min-h-[4.75rem] items-center gap-2 py-2 sm:gap-3">
          <Link
            href="/"
            aria-label={`${siteName} home`}
            className="group flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
          >
            <BrandMark className="transition-transform duration-200 ease-out group-hover:rotate-12 motion-reduce:transform-none" />
            <span className="truncate text-[0.7rem] font-semibold tracking-[0.11em] text-ink sm:text-[0.78rem]">
              <span className="sm:hidden">PROPEPTIQ</span>
              <span className="hidden sm:inline">{siteName}</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 min-[1180px]:flex">
            {publicNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-3 text-sm font-medium text-muted-ink transition-colors duration-200 hover:bg-moss-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/cart"
            aria-label={`Cart, ${itemCount} requested unit${itemCount === 1 ? "" : "s"}`}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[1180px]:ml-3 sm:px-3"
          >
            <ShoppingBag aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Cart</span>
            <span className="cart-count" aria-hidden="true">{itemCount}</span>
          </Link>

          <Link
            href="/sign-in"
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
                className="size-11 rounded-full border-ink/20 bg-transparent text-ink hover:bg-moss-soft/60 min-[1180px]:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(24rem,calc(100vw-1rem))] border-border bg-canvas p-0"
            >
              <SheetHeader className="border-b border-border px-6 pb-5 pt-6 text-left">
                <div className="flex items-center gap-3 pr-10">
                  <BrandMark />
                  <SheetTitle className="font-sans text-xs font-semibold tracking-[0.11em]">
                    {siteName}
                  </SheetTitle>
                </div>
                <SheetDescription className="pt-4 leading-6 text-muted-ink">
                  {researchRestrictions[0]} {researchRestrictions[1]}
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile primary" className="flex flex-col px-3 py-4">
                {publicNavigation.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-12 items-center rounded-xl px-3 py-3 font-medium text-ink transition-colors duration-200 hover:bg-moss-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.label}
                    </Link>
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
                    href="/sign-in"
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
