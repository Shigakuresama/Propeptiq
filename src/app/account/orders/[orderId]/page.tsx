import { notFound } from "next/navigation";

import { orderAccessReason } from "@/account/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";

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
      <p className="eyebrow">Owner-only order</p>
      <h1 className="mt-4 break-all font-heading text-page leading-[0.95]">Order {order.id}</h1>
      <dl className="record-card mt-8 grid gap-5 sm:grid-cols-2">
        <div><dt className="eyebrow">State</dt><dd className="mt-2 text-xl capitalize">{order.state.replaceAll("_", " ")}</dd></div>
        <div><dt className="eyebrow">Total</dt><dd className="mt-2 text-xl tabular-nums">{money(order.totalMinor, order.currency)}</dd></div>
        <div><dt className="eyebrow">Destination state</dt><dd className="mt-2 text-xl">{order.destinationStateCode}</dd></div>
        <div><dt className="eyebrow">Created</dt><dd className="mt-2 text-xl">{new Date(order.createdAt).toLocaleDateString("en-US")}</dd></div>
        <div><dt className="eyebrow">Payment</dt><dd className="mt-2 text-xl capitalize">{order.paymentState.replaceAll("_", " ")}</dd></div>
        <div><dt className="eyebrow">Refund</dt><dd className="mt-2 text-xl capitalize">{order.refundState}</dd></div>
        <div><dt className="eyebrow">Fulfillment hold</dt><dd className="mt-2 text-xl capitalize">{order.holdState}</dd></div>
        <div><dt className="eyebrow">Release</dt><dd className="mt-2 text-xl capitalize">{order.releaseState}</dd></div>
        <div><dt className="eyebrow">Shipment</dt><dd className="mt-2 text-xl capitalize">{order.shipmentState.replaceAll("_", " ")}</dd></div>
      </dl>
      <h2 className="mt-10 font-heading text-3xl">Order items</h2>
      <ul className="mt-5 grid gap-4 p-0">{order.items.map((item) => <li key={item.id} className="record-card"><p className="font-heading text-2xl">{item.productName}</p><p className="mt-2 text-base text-muted-ink">{item.packageForm}</p><p className="mt-4 tabular-nums">{item.quantity} × {money(item.unitAmountMinor, order.currency)} · {money(item.totalMinor, order.currency)}</p></li>)}</ul>
    </article>
  );
}
