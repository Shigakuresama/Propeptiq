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
  { href: "/account" as const, label: "Account" },
  { href: "/account/orders" as const, label: "Order history" },
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
          <nav aria-label="Account" className="ml-auto hidden items-center gap-2 xl:flex"><NavLinks /></nav>
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="ml-auto size-11 xl:hidden" aria-label="Open account navigation">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(24rem,calc(100vw-1rem))] border-border bg-canvas p-0">
              <SheetHeader className="border-b border-border p-6 text-left">
                <SheetTitle>Account navigation</SheetTitle>
                <SheetDescription>Profile, orders, and checkout status.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile account" className="grid gap-2 p-4">
                {links.map((link) => <SheetClose asChild key={link.href}><ShellNavLink href={link.href}>{link.label}</ShellNavLink></SheetClose>)}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="site-container py-10 sm:py-16">{children}</main>
      {localDriver ? (
        <form action={signOutLocalActor} className="site-container pb-10">
          <Button type="submit" variant="outline" className="min-h-11">End fixed test session</Button>
        </form>
      ) : null}
    </div>
  );
}
