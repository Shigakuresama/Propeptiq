"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/site/brand-mark";
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
  return (
    <>
      <div className="border-b border-border bg-ink px-4 py-2 text-center text-xs leading-5 text-canvas sm:px-6">
        <span>{researchRestrictions[0]}</span>{" "}
        <span className="text-canvas/70">{researchRestrictions[1]}</span>
      </div>
      <header className="sticky top-0 z-40 border-b border-border/90 bg-canvas/95 backdrop-blur-md">
        <div className="site-container flex h-[4.75rem] items-center gap-3">
          <Link
            href="/"
            aria-label={`${siteName} home`}
            className="group flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
          >
            <BrandMark className="transition-transform duration-200 ease-out group-hover:rotate-12 motion-reduce:transform-none" />
            <span className="truncate text-[0.72rem] font-semibold tracking-[0.11em] text-ink sm:text-[0.78rem]">
              {siteName}
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

          <Button
            asChild
            variant="outline"
            className="ml-auto h-11 rounded-full border-ink/20 bg-transparent px-4 text-ink hover:bg-moss-soft/60 min-[1180px]:ml-3"
          >
            <Link href="/access">Account</Link>
          </Button>

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
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
