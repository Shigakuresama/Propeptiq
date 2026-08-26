import type { Metadata } from "next";
import Link from "next/link";

import { orderAccessReason } from "@/account/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";

export const metadata: Metadata = { title: "Order history" };

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

export default async function OrdersPage() {
  const request = await getRequestIdentity();
  const repositories = getRequestRepositories(request);
  const reason = orderAccessReason(request);
  if (reason || !repositories || !request.principal) {
    return <section className="error-record"><h1 className="font-heading text-page">Order history unavailable</h1><p className="mt-4 text-base leading-7">A verified owner identity and database are required.</p></section>;
  }
  const orders = await repositories.listOrders();
  return (
    <section>
      <p className="eyebrow">Owner-scoped records</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Order history</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-ink">Only orders belonging to this authenticated account are queried.</p>
      {orders.length === 0 ? <div className="empty-record mt-8">No orders exist for this account.</div> : (
        <ul className="mt-8 grid gap-4 p-0">
          {orders.map((order) => (
            <li key={order.id} className="record-card grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-heading text-2xl">Order {order.id}</p>
                <p className="mt-2 text-base text-muted-ink">{new Date(order.createdAt).toLocaleDateString("en-US")} · {order.state.replaceAll("_", " ")}</p>
                <p className="mt-2 text-base text-muted-ink">
                  Payment: {order.paymentState.replaceAll("_", " ")} · Refund: {order.refundState} · Shipment: {order.shipmentState.replaceAll("_", " ")}
                </p>
              </div>
              <div className="sm:text-right"><p className="text-xl font-semibold tabular-nums">{money(order.totalMinor, order.currency)}</p><Link href={`/account/orders/${order.id}`} className="record-link mt-2 inline-flex min-h-11 items-center">View order</Link></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
