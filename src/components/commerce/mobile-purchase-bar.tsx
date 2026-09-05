"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { createPortal } from "react-dom";

import { formatStorefrontMoney, type PricePresentation } from "@/catalog/storefront-price-presentation";
import { PUBLIC_PURCHASE_SLOT_ID } from "@/components/site/public-action-dock";
import { AddToCartButton } from "./add-to-cart-button";

type MobilePurchaseBarProps = Readonly<{
  productSlug: string;
  inlineSummaryRef: RefObject<HTMLDivElement | null>;
  quantity: number | null;
  presentation: PricePresentation | null;
  status: string;
  addToCartProps: ComponentProps<typeof AddToCartButton>;
}>;

const MOBILE_QUERY = "(max-width: 767px)";
const RESERVE_PROPERTY = "--public-action-dock-reserved-height";
const HEADER_PROPERTY = "--public-purchase-header-height";

export function MobilePurchaseBar({ productSlug, inlineSummaryRef, quantity, presentation, status, addToCartProps }: MobilePurchaseBarProps) {
  const pathname = usePathname();
  const activeRoute = pathname === `/catalog/items/${productSlug}`;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const [passedSummary, setPassedSummary] = useState(false);
  const [fits, setFits] = useState(false);
  const [focused, setFocused] = useState(false);
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const summary = inlineSummaryRef.current;
    const target = document.getElementById(PUBLIC_PURCHASE_SLOT_ID);
    if (!activeRoute || !summary || !target || typeof IntersectionObserver !== "function" || typeof window.matchMedia !== "function") return;
    let alive = true;
    let scrollFrame = 0;
    const media = window.matchMedia(MOBILE_QUERY);
    const updateMobile = () => {
      if (!alive) return;
      setMobile(media.matches);
      if (media.matches) setPassedSummary(summary.getBoundingClientRect().bottom < 0);
    };
    const mount = requestAnimationFrame(() => {
      if (!alive) return;
      setSlot(target);
      setMobile(media.matches);
    });
    const observer = new IntersectionObserver((entries) => {
      if (!alive) return;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]!;
        if (entry.target !== summary) continue;
        setPassedSummary(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
        break;
      }
    }, { threshold: 0 });
    observer.observe(summary);
    // A jump can skip the intersecting state between IO frames. Sample only
    // this summary, at most once per scroll frame, to retain the same rule.
    const checkScroll = () => {
      if (!alive || !media.matches || scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (alive) setPassedSummary(summary.getBoundingClientRect().bottom < 0);
      });
    };
    window.addEventListener("scroll", checkScroll, { passive: true });
    media.addEventListener("change", updateMobile);
    return () => {
      alive = false;
      cancelAnimationFrame(mount);
      cancelAnimationFrame(scrollFrame);
      observer.disconnect();
      window.removeEventListener("scroll", checkScroll);
      media.removeEventListener("change", updateMobile);
    };
  }, [activeRoute, inlineSummaryRef]);

  useEffect(() => {
    const row = rowRef.current;
    const dock = slot?.parentElement;
    const layout = dock?.closest<HTMLElement>(".public-layout");
    if (!activeRoute || !row || !dock || !layout) return;
    const header = layout.querySelector<HTMLElement>(".persistent-chrome");
    const previousReserve = layout.style.getPropertyValue(RESERVE_PROPERTY);
    const previousHeader = layout.style.getPropertyValue(HEADER_PROPERTY);
    let largestReservation = 0;
    let frame = 0;
    let alive = true;

    const measure = () => {
      frame = 0;
      if (!alive) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const bottom = Number.parseFloat(getComputedStyle(dock).bottom) || 32;
      const occupied = Math.ceil(row.getBoundingClientRect().height + dock.getBoundingClientRect().height + 8 + bottom);
      const hasRoom = mobile && occupied <= Math.min(viewportHeight / 2, viewportHeight - headerHeight - 96);
      layout.style.setProperty(HEADER_PROPERTY, `${headerHeight}px`);
      if (!hasRoom && row.contains(document.activeElement)) {
        // A resize or larger text must not leave focus on a hidden/oversized row.
        const heading = inlineSummaryRef.current?.parentElement?.querySelector<HTMLElement>(".product-purchase-heading");
        if (heading) {
          heading.focus({ preventScroll: true });
          heading.scrollIntoView?.({ behavior: "instant", block: "start" });
          setFocused(false);
        }
      }
      setFits(hasRoom);
      // Measure even while the row is inert. Reserve a high-water mark for this
      // mobile viewport session, never toggle height in response to scrolling.
      if (hasRoom || row.contains(document.activeElement)) {
        largestReservation = Math.max(largestReservation, occupied);
        layout.style.setProperty(RESERVE_PROPERTY, `${largestReservation}px`);
      }
    };
    const schedule = () => { if (alive && frame === 0) frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(row);
    observer?.observe(dock);
    if (header) observer?.observe(header);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      if (previousReserve) layout.style.setProperty(RESERVE_PROPERTY, previousReserve);
      else layout.style.removeProperty(RESERVE_PROPERTY);
      if (previousHeader) layout.style.setProperty(HEADER_PROPERTY, previousHeader);
      else layout.style.removeProperty(HEADER_PROPERTY);
    };
  }, [activeRoute, inlineSummaryRef, mobile, slot]);

  if (!activeRoute || slot === null) return null;
  const visible = focused || (mobile && passedSummary && fits);
  const subtotal = quantity !== null && presentation?.state === "priced"
    ? formatStorefrontMoney(presentation.price.lineSubtotalMinor)
    : null;

  return createPortal(
    <section
      aria-label="Mobile purchase controls"
      aria-hidden={!visible}
      className="mobile-purchase-bar"
      data-visible={visible ? "true" : "false"}
      inert={!visible}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onFocusCapture={() => setFocused(true)}
      ref={rowRef}
      role="region"
    >
      <div className="mobile-purchase-bar__summary">
        <div>
          <p className="mobile-purchase-bar__name">{addToCartProps.productName}</p>
          <p>{addToCartProps.variantLabel ?? "No variant selected"} · {quantity === null ? "Invalid quantity" : `${quantity} bottle${quantity === 1 ? "" : "s"}`}</p>
        </div>
        <div className="mobile-purchase-bar__price">
          {subtotal !== null ? <p><span className="sr-only">Subtotal </span><strong>{subtotal}</strong></p> : null}
          <p>{status}</p>
        </div>
      </div>
      <div className="mobile-purchase-bar__actions">
        <a className="record-link" href="#purchase-heading">Change selection</a>
        <AddToCartButton {...addToCartProps} />
      </div>
    </section>,
    slot,
  );
}
