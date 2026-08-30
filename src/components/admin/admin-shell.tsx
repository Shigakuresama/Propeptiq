import { Gauge, Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminResource } from "@/admin/access";
import { DataLabel, RecordPanel } from "@/components/design-system/archive-primitives";
import { BrandLogo } from "@/components/site/brand-mark";
import { ResearchRestrictionBar } from "@/components/site/research-restriction-bar";
import { ShellNavLink } from "@/components/site/shell-nav-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AdminShell({ children, resources }: { children: ReactNode; resources: readonly AdminResource[] }) {
  return (
    <div className="min-h-svh">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <ResearchRestrictionBar />
      <header className="border-b border-border bg-canvas/95">
        <div className="site-container flex min-h-20 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin"
              aria-label="PROPEPTIQ LABS administration home"
              className="flex min-h-11 shrink-0 items-center rounded-lg bg-ink px-1.5 no-underline"
            >
              <BrandLogo className="w-24" decorative />
            </Link>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-accent-readable sm:block">
              Admin operations
            </span>
          </div>
          <span className="ml-auto hidden xl:inline-flex"><ShellNavLink href="/account">Account</ShellNavLink></span>
          <Sheet>
            <SheetTrigger asChild><Button type="button" variant="outline" size="icon" className="ml-auto size-11 xl:hidden" aria-label="Open administration navigation"><Menu /></Button></SheetTrigger>
            <SheetContent className="w-[min(26rem,calc(100vw-1rem))] overflow-y-auto border-border bg-canvas p-0">
              <SheetHeader className="border-b border-border p-6 text-left"><SheetTitle>Administration</SheetTitle><SheetDescription>{resources.length} capability-scoped resource{resources.length === 1 ? "" : "s"} available in this session.</SheetDescription></SheetHeader>
              <nav aria-label="Mobile administration" className="grid gap-1 p-4">
                {resources.map((resource) => <SheetClose asChild key={resource.slug}><ShellNavLink href={`/admin/${resource.slug}`}>{resource.label}</ShellNavLink></SheetClose>)}
                <SheetClose asChild><ShellNavLink href="/account">Account</ShellNavLink></SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <div className="site-container grid gap-8 py-10 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <RecordPanel className="sticky top-6 p-3">
            <div className="border-b border-border px-3 pb-4 pt-2">
              <div className="flex items-center gap-2 text-accent-readable">
                <Gauge aria-hidden="true" className="size-4" />
                <DataLabel>Operations index</DataLabel>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-ink">
                {resources.length} capability-scoped resource{resources.length === 1 ? "" : "s"}.
              </p>
            </div>
            <nav aria-label="Administration" className="mt-3 grid gap-1">{resources.map((resource) => <ShellNavLink href={`/admin/${resource.slug}`} key={resource.slug}>{resource.label}</ShellNavLink>)}</nav>
          </RecordPanel>
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
