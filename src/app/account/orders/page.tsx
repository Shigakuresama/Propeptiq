import type { Metadata } from "next";
import { PackageOpen } from "lucide-react";
import Link from "next/link";

import { orderAccessReason } from "@/account/access";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { DataLabel, EmptyState, RecordPanel } from "@/components/design-system/archive-primitives";

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
      <DataLabel>Owner-scoped records</DataLabel>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Order history</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-ink">Only orders belonging to this authenticated account are queried.</p>
      {orders.length === 0 ? (
        <EmptyState
          className="mt-8"
          description="Completed checkout records will appear here only after the server creates an owner-scoped order."
          eyebrow="Order archive"
          icon={PackageOpen}
          title="No orders exist for this account."
          action={<Link className="record-link inline-flex min-h-11 items-center" href="/catalog">Browse catalog</Link>}
        />
      ) : (
        <ul className="mt-8 grid gap-4 p-0">
          {orders.map((order) => (
            <li key={order.id}>
              <RecordPanel interactive className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start gap-3">
                    <p className="min-w-0 break-all font-heading text-2xl">Order {order.id}</p>
                    <span className="status-pill capitalize">{order.state.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-3 text-base text-muted-ink">{new Date(order.createdAt).toLocaleDateString("en-US")}</p>
                  <p className="mt-2 text-base leading-7 text-muted-ink">
                    Payment: {order.paymentState.replaceAll("_", " ")} · Refund: {order.refundState} · Shipment: {order.shipmentState.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right"><p className="text-xl font-semibold tabular-nums">{money(order.totalMinor, order.currency)}</p><Link href={`/account/orders/${order.id}`} className="record-link mt-2 inline-flex min-h-11 items-center">View order</Link></div>
              </RecordPanel>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
