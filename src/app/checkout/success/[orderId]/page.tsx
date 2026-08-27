import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { orderAccessReason } from "@/account/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import type { CheckoutSuccessReadModel } from "@/commerce/checkout-success-read";
import { AccountShell } from "@/components/account/account-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
};

function money(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountMinor / 100);
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function paymentCopy(state: CheckoutSuccessReadModel["paymentState"]) {
  if (state === "paid") {
    return {
      heading: "Payment verified",
      detail: "A signed payment event now matches this order's durable facts.",
      className: "info-record",
    };
  }
  if (state === "failed") {
    return {
      heading: "Payment was not verified",
      detail: "This order is not paid. Review the order state before trying again.",
      className: "error-record",
    };
  }
  return {
    heading: "Payment verification pending",
    detail: "Payment is being verified from a signed provider event. Returning from hosted checkout does not mark an order paid, and refreshing cannot confirm payment.",
    className: "warning-record",
  };
}

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const request = await getRequestIdentity();
  const repositories = getRequestRepositories(request);
  if (orderAccessReason(request) !== null || repositories === null) notFound();
  const { orderId } = await params;
  const order = await repositories.loadCheckoutSuccess(orderId);
  if (order === null) notFound();
  const payment = paymentCopy(order.paymentState);

  return (
    <AccountShell localDriver={request.localDriver !== null}>
      <article className="mx-auto max-w-5xl">
        <p className="eyebrow">Owner-only order record</p>
        {request.localDriver !== null ? (
          <p className="warning-record mt-5 font-semibold">Synthetic local test only</p>
        ) : null}
        <h1 className="mt-4 break-all font-heading text-page leading-[0.92]">
          Order status
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
          This read-only record is based on internal order and signed-event facts. Refreshing it does not change payment, inventory, or fulfillment.
        </p>

        <section className={`${payment.className} mt-8`} role="status" aria-live="polite">
          <h2 className="font-heading text-3xl">{payment.heading}</h2>
          <p className="mt-3 text-base leading-7">{payment.detail}</p>
        </section>

        <dl className="record-card mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="eyebrow">Order</dt><dd className="mt-2 break-all text-base">{order.orderId}</dd></div>
          <div><dt className="eyebrow">Order state</dt><dd className="mt-2 text-xl capitalize">{statusLabel(order.state)}</dd></div>
          <div><dt className="eyebrow">Total</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{money(order.totalMinor)}</dd></div>
          <div><dt className="eyebrow">Refund</dt><dd className="mt-2 text-xl capitalize">{statusLabel(order.refundState)}</dd></div>
          <div><dt className="eyebrow">Hold</dt><dd className="mt-2 text-xl capitalize">{statusLabel(order.holdState)}</dd></div>
          <div><dt className="eyebrow">Shipment</dt><dd className="mt-2 text-xl capitalize">{statusLabel(order.shipmentState)}</dd></div>
        </dl>

        <section className="mt-10" aria-labelledby="success-items-heading">
          <h2 id="success-items-heading" className="font-heading text-3xl">Order items</h2>
          <ul className="mt-5 grid gap-4 p-0">
            {order.items.map((item) => (
              <li key={item.id} className="record-card grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <h3 className="font-heading text-2xl">{item.productName}</h3>
                  <p className="mt-2 text-base text-muted-ink">{item.packageForm}</p>
                </div>
                <p className="tabular-nums sm:text-right">
                  {item.quantity} × {money(item.unitAmountMinor)} · {money(item.totalMinor)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/account/orders" className="record-link inline-flex min-h-11 items-center">View order history</Link>
          <Link href="/catalog" className="record-link inline-flex min-h-11 items-center">Return to catalog</Link>
        </div>
      </article>
    </AccountShell>
  );
}
