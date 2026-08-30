import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DataLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("data-label", className)}>{children}</p>;
}

export function RecordPanel({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "record-panel",
        interactive && "record-panel-interactive",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <DataLabel>{label}</DataLabel>
      <p className="metric-value mt-3 text-ink">{value}</p>
      {detail ? <p className="mt-3 text-base leading-7 text-muted-ink">{detail}</p> : null}
    </div>
  );
}

export function Notice({
  children,
  className,
  icon: Icon,
  title,
  tone = "info",
}: {
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
  title?: string;
  tone?: "info" | "warning" | "danger";
}) {
  return (
    <div
      className={cn("notice-panel grid gap-3 p-4 sm:grid-cols-[auto_1fr] sm:p-5", className)}
      data-tone={tone}
      role={tone === "danger" ? "alert" : "note"}
    >
      {Icon ? <Icon aria-hidden="true" className="mt-0.5 size-5 text-current" /> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        <div className={cn("text-base leading-7 text-muted-ink", title && "mt-1")}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  action,
  className,
  description,
  eyebrow,
  headingLevel = "h2",
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description: ReactNode;
  eyebrow: string;
  headingLevel?: "h1" | "h2";
  icon: LucideIcon;
  title: string;
}) {
  const Heading = headingLevel;

  return (
    <RecordPanel
      className={cn(
        "grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:p-10",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full border border-moss/25 bg-moss-soft text-accent-readable">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <div className="max-w-[62ch]">
        <DataLabel>{eyebrow}</DataLabel>
        <Heading className="mt-3 text-balance font-heading text-3xl leading-tight text-ink sm:text-4xl">
          {title}
        </Heading>
        <div className="mt-4 text-base leading-7 text-muted-ink">{description}</div>
      </div>
      {action ? <div className="flex flex-wrap gap-3 lg:justify-end">{action}</div> : null}
    </RecordPanel>
  );
}

export function SectionShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("site-container", className)}>{children}</div>;
}
