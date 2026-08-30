import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { orderAccessReason } from "@/account/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { DataLabel, RecordPanel } from "@/components/design-system/archive-primitives";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const request = await getRequestIdentity();
  const repositories = getRequestRepositories(request);
  const reason = orderAccessReason(request);
  if (reason || !repositories || !request.principal) notFound();
  const { orderId } = await params;
  const order = await repositories.loadOrder(orderId);
  if (!order) notFound();
  return (
    <article className="max-w-4xl">
      <Link href="/account/orders" className="record-link inline-flex min-h-11 items-center gap-2">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Order history
      </Link>
      <DataLabel className="mt-6">Owner-only order</DataLabel>
      <h1 className="mt-4 break-all font-heading text-page leading-[0.95]">Order {order.id}</h1>
      <RecordPanel className="mt-8 overflow-hidden">
        <dl className="grid sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["State", order.state.replaceAll("_", " ")],
            ["Total", money(order.totalMinor, order.currency)],
            ["Destination state", order.destinationStateCode],
            ["Created", new Date(order.createdAt).toLocaleDateString("en-US")],
            ["Payment", order.paymentState.replaceAll("_", " ")],
            ["Refund", order.refundState],
            ["Fulfillment hold", order.holdState],
            ["Release", order.releaseState],
            ["Shipment", order.shipmentState.replaceAll("_", " ")],
          ].map(([label, value]) => (
            <div className="border-b border-border p-5 sm:border-r last:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0" key={label}>
              <dt className="data-label">{label}</dt>
              <dd className="mt-3 break-words text-lg font-semibold capitalize tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </RecordPanel>
      <h2 className="mt-10 font-heading text-3xl">Order items</h2>
      <ul className="mt-5 grid gap-4 p-0">{order.items.map((item) => <li key={item.id}><RecordPanel className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6"><div><p className="font-heading text-2xl">{item.productName}</p><p className="mt-2 text-base text-muted-ink">{item.packageForm}</p></div><p className="tabular-nums sm:text-right">{item.quantity} × {money(item.unitAmountMinor, order.currency)} · {money(item.totalMinor, order.currency)}</p></RecordPanel></li>)}</ul>
    </article>
  );
}
