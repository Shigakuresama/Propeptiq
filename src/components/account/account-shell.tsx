import { Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOutLocalActor } from "@/auth/actions";
import { BrandMark } from "@/components/site/brand-mark";
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

const links = [
  { href: "/account" as const, label: "Overview" },
  { href: "/account/orders" as const, label: "Orders" },
  { href: "/account/rewards" as const, label: "Rewards" },
  { href: "/account/referrals" as const, label: "Referrals" },
  { href: "/account/partner" as const, label: "Partner" },
  { href: "/checkout" as const, label: "Checkout" },
];

function NavLinks() {
  return links.map((link) => (
    <ShellNavLink key={link.href} href={link.href}>{link.label}</ShellNavLink>
  ));
}

export function AccountShell({
  children,
  localDriver,
}: {
  children: ReactNode;
  localDriver: boolean;
}) {
  return (
    <div className="min-h-svh">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <ResearchRestrictionBar />
      <header className="border-b border-border bg-canvas">
        <div className="site-container flex min-h-20 items-center gap-4">
          <Link href="/" className="flex min-h-11 items-center gap-3 rounded-full px-1 font-semibold tracking-[0.08em]">
            <BrandMark /> <span>PROPEPTIQ LABS</span>
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="ml-auto size-11 xl:hidden" aria-label="Open account navigation">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(24rem,calc(100vw-1rem))] border-border bg-canvas p-0">
              <SheetHeader className="border-b border-border p-6 text-left">
                <SheetTitle>Account navigation</SheetTitle>
                <SheetDescription>Overview, orders, growth programs, and checkout.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile account" className="grid gap-2 p-4">
                {links.map((link) => <SheetClose asChild key={link.href}><ShellNavLink href={link.href}>{link.label}</ShellNavLink></SheetClose>)}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <div className="site-container xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-10">
        <aside className="hidden xl:block">
          <div className="sticky top-8 py-16">
            <p className="eyebrow px-4">Account</p>
            <nav aria-label="Account" className="mt-4 grid gap-1"><NavLinks /></nav>
          </div>
        </aside>
        <div className="min-w-0">
          <main id="main-content" tabIndex={-1} className="py-10 sm:py-16">{children}</main>
          {localDriver ? (
            <form action={signOutLocalActor} className="pb-10">
              <Button type="submit" variant="outline" className="min-h-11">End fixed test session</Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
