"use client";

import { CircleCheck, CircleOff, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type PublicSetItem = Readonly<{
  productId: string;
  quantity: number;
  slug: string;
  name: string;
  packageForm: string;
}>;

type SharedSetCardProps =
  | Readonly<{
      variant: "public";
      label: string;
      items: readonly PublicSetItem[];
      omissionNotice: string | null;
      actions?: ReactNode;
    }>
  | Readonly<{
      variant: "owner";
      code: string;
      label: string;
      itemCount: number;
      active: boolean;
      children?: ReactNode;
    }>;

export function SharedSetCard(props: SharedSetCardProps) {
  const headingId = useId();
  const [copyMessage, setCopyMessage] = useState("");

  if (props.variant === "public") {
    return (
      <article className="grid gap-6" aria-labelledby={headingId}>
        <div>
          <p className="eyebrow">Shared research set</p>
          <h1 id={headingId} className="mt-4 font-heading text-page">{props.label}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-ink">
            Product details are resolved from the current public catalog. This set carries quantities only.
          </p>
        </div>
        {props.omissionNotice ? (
          <p className="info-record">{props.omissionNotice}</p>
        ) : null}
        {props.items.length > 0 ? (
          <ul className="grid gap-4 p-0">
            {props.items.map((item) => (
              <li className="record-card min-w-0" key={item.productId}>
                <Link className="record-link text-lg font-semibold" href={`/catalog/items/${item.slug}`}>
                  {item.name}
                </Link>
                <p className="mt-2 text-base leading-7 text-muted-ink">
                  {item.packageForm} · Quantity {item.quantity}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-record">No saved products remain in the current public catalog.</p>
        )}
        {props.items.length > 0 && props.actions ? <div>{props.actions}</div> : null}
      </article>
    );
  }

  const publicPath = `/sets/${props.code}`;
  const StatusIcon = props.active ? CircleCheck : CircleOff;

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopyMessage("Public link copied.");
    } catch {
      setCopyMessage("Public link could not be copied.");
    }
  }

  return (
    <article className="record-card min-w-0" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={headingId} className="font-heading text-2xl">{props.label}</h3>
          <p className="mt-2 text-base text-muted-ink">
            {props.itemCount} saved {props.itemCount === 1 ? "product" : "products"}
          </p>
        </div>
        <span className="inline-flex min-h-11 items-center gap-2 text-base font-semibold">
          <StatusIcon aria-hidden="true" className="size-5 text-moss" />
          {props.active ? "Active" : "Inactive"}
        </span>
      </div>

      {props.active ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            className="record-link inline-flex min-h-11 items-center gap-2"
            href={{ pathname: publicPath }}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Open public link
          </Link>
          <Button type="button" variant="outline" className="min-h-11" onClick={copyPublicLink}>
            <Copy aria-hidden="true" />
            Copy public link
          </Button>
        </div>
      ) : null}

      {copyMessage ? (
        <p className="info-record mt-4" role="status" aria-live="polite">{copyMessage}</p>
      ) : null}
      {props.children ? <div className="mt-7 grid gap-6">{props.children}</div> : null}
    </article>
  );
}
