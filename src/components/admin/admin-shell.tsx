import { Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminResource } from "@/admin/access";
import { BrandMark } from "@/components/site/brand-mark";
import { ResearchRestrictionBar } from "@/components/site/research-restriction-bar";
import { ShellNavLink } from "@/components/site/shell-nav-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AdminShell({ children, resources }: { children: ReactNode; resources: readonly AdminResource[] }) {
  return (
    <div className="min-h-svh">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <ResearchRestrictionBar />
      <header className="border-b border-border bg-canvas">
        <div className="site-container flex min-h-20 items-center gap-4">
          <Link href="/admin" className="flex min-h-11 items-center gap-3 rounded-full px-1 font-semibold tracking-[0.08em]"><BrandMark /> ADMIN OPERATIONS</Link>
          <span className="ml-auto hidden xl:inline-flex"><ShellNavLink href="/account">Account</ShellNavLink></span>
          <Sheet>
            <SheetTrigger asChild><Button type="button" variant="outline" size="icon" className="ml-auto size-11 xl:hidden" aria-label="Open administration navigation"><Menu /></Button></SheetTrigger>
            <SheetContent className="w-[min(26rem,calc(100vw-1rem))] overflow-y-auto border-border bg-canvas p-0">
              <SheetHeader className="border-b border-border p-6 text-left"><SheetTitle>Administration</SheetTitle><SheetDescription>Only resources covered by active capabilities are shown.</SheetDescription></SheetHeader>
              <nav aria-label="Mobile administration" className="grid gap-1 p-4">{resources.map((resource) => <SheetClose asChild key={resource.slug}><ShellNavLink href={`/admin/${resource.slug}`}>{resource.label}</ShellNavLink></SheetClose>)}</nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <div className="site-container grid gap-8 py-10 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden xl:block"><nav aria-label="Administration" className="sticky top-6 grid gap-1">{resources.map((resource) => <ShellNavLink href={`/admin/${resource.slug}`} key={resource.slug}>{resource.label}</ShellNavLink>)}</nav></aside>
        <main id="main-content" tabIndex={-1} className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
