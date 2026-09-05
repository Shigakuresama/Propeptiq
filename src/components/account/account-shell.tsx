import { LockKeyhole, Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  signOutLocalActor,
} from "@/auth/actions";
import { ManagedSignOutForm } from "@/components/account/managed-sign-out-form";
import { DataLabel, RecordPanel } from "@/components/design-system/archive-primitives";
import { BrandLogo } from "@/components/site/brand-mark";
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
  { href: "/research-sets" as const, label: "Research sets" },
  { href: "/cart" as const, label: "Cart" },
  { href: "/checkout" as const, label: "Checkout" },
];

function NavLinks() {
  return links.map((link) => (
    <ShellNavLink key={link.href} href={link.href}>{link.label}</ShellNavLink>
  ));
}

export function AccountShell({
  children,
  authEnabled = false,
  localDriver,
}: {
  children: ReactNode;
  authEnabled?: boolean;
  localDriver: boolean;
}) {
  return (
    <div className="min-h-svh">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <ResearchRestrictionBar />
      <header className="border-b border-border bg-canvas/95">
        <div className="site-container flex min-h-20 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="PROPEPTIQ LABS home"
              className="flex min-h-11 shrink-0 items-center rounded-lg bg-ink px-1.5 no-underline"
            >
              <BrandLogo decorative tone="inverse" />
            </Link>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-accent-readable sm:block">
              Private records
            </span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="ml-auto size-11 xl:hidden" aria-label="Open account navigation">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(24rem,calc(100vw-1rem))] border-border bg-canvas p-0">
              <SheetHeader className="border-b border-border p-6 text-left">
                <SheetTitle>Account navigation</SheetTitle>
                <SheetDescription>Overview, orders, growth programs, research sets, cart, and checkout.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile account" className="grid gap-2 p-4">
                {links.map((link) => <SheetClose asChild key={link.href}><ShellNavLink href={link.href}>{link.label}</ShellNavLink></SheetClose>)}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <div className="site-container xl:grid xl:grid-cols-[16rem_minmax(0,1fr)] xl:gap-10">
        <aside className="hidden xl:block">
          <div className="sticky top-8 py-16">
            <RecordPanel className="p-3">
              <div className="border-b border-border px-3 pb-4 pt-2">
                <div className="flex items-center gap-2 text-accent-readable">
                  <LockKeyhole aria-hidden="true" className="size-4" />
                  <DataLabel>Account workspace</DataLabel>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-ink">
                  Owner-scoped records and commerce steps.
                </p>
              </div>
              <nav aria-label="Account" className="mt-3 grid gap-1"><NavLinks /></nav>
            </RecordPanel>
          </div>
        </aside>
        <div className="min-w-0">
          <main
            id="main-content"
            tabIndex={-1}
            className="site-motion-surface site-motion-surface--quiet py-10 sm:py-16"
            data-motion-surface="private"
          >
            {children}
          </main>
          {localDriver ? (
            <form action={signOutLocalActor} className="border-t border-border py-8">
              <Button type="submit" variant="outline" className="min-h-11">End fixed test session</Button>
            </form>
          ) : authEnabled ? (
            <ManagedSignOutForm className="border-t border-border py-8" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
