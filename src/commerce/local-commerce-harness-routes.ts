import "server-only";

import { getRequestIdentity } from "@/auth/server";
import {
  authorizeLocalCommerceHarness,
  localHarnessNotFound,
} from "@/commerce/local-harness-http";

export type SyntheticHostedRouteContext = Readonly<{
  params: Promise<{ sessionId: string }>;
}>;

function money(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountMinor / 100);
}

function hostedPage(sessionId: string, amountMinor: number): string {
  const amount = money(amountMinor);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Synthetic checkout | PROPEPTIQ Labs</title>
  <style>
    :root{color-scheme:light;--ink:#151515;--muted:#5f5a52;--paper:#f5f1e8;--panel:#fffdf8;--accent:#ff6b35;--border:#c9c0b3}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:2rem 1rem}.card{width:min(100%,42rem);background:var(--panel);border:1px solid var(--border);border-radius:1.5rem;padding:clamp(1.5rem,5vw,3rem);box-shadow:0 1rem 3rem #352c2018}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.75rem;font-weight:800}.muted{color:var(--muted)}h1{font-size:clamp(2rem,7vw,4.5rem);line-height:.95;margin:.75rem 0 1.25rem}.totals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;border-block:1px solid var(--border);padding:1.25rem 0;margin:1.75rem 0}.value{font-size:1.5rem;font-weight:700}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}button{width:100%;min-height:48px;border-radius:999px;border:1px solid var(--ink);padding:.75rem 1rem;font:inherit;font-weight:750;cursor:pointer;background:transparent;color:var(--ink)}.primary{background:var(--ink);color:white}.primary:hover,.primary:focus-visible{background:var(--accent);color:var(--ink)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media(max-width:36rem){.actions{grid-template-columns:1fr}.totals{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  </style>
</head>
<body>
  <main>
    <article class="card">
      <p class="eyebrow">Synthetic local test only</p>
      <h1>Hosted payment test double</h1>
      <p class="muted">This deterministic page is not a payment provider and collects no card details. It exists only for guarded local browser acceptance.</p>
      <dl class="totals">
        <div><dt class="eyebrow">Test total</dt><dd class="value">${amount}</dd></div>
        <div><dt class="eyebrow">Currency</dt><dd class="value">USD</dd></div>
      </dl>
      <div class="actions">
        <form method="post" action="/__synthetic_local_checkout/${sessionId}/return"><button type="submit">Return without payment event</button></form>
        <form method="post" action="/__synthetic_local_checkout/${sessionId}/complete"><button type="submit" class="primary">Complete synthetic checkout</button></form>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function canonicalSessionId(value: string): boolean {
  return /^[a-z0-9_]{1,96}$/u.test(value);
}

export async function getSyntheticHostedCheckout(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  try {
    const requestIdentity = await getRequestIdentity();
    const authorized = authorizeLocalCommerceHarness({
      request,
      requestIdentity,
      requireOriginHeader: false,
      requireOwner: true,
    });
    const { sessionId } = await context.params;
    if (
      authorized === null ||
      authorized.ownerUserId === null ||
      !canonicalSessionId(sessionId)
    ) return localHarnessNotFound();
    const session = authorized.driver.commerce.loadSyntheticHostedSession({
      ownerUserId: authorized.ownerUserId,
      sessionId,
    });
    if (session === null) return localHarnessNotFound();
    return new Response(hostedPage(sessionId, session.totalMinor), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return localHarnessNotFound();
  }
}

export async function completeSyntheticHostedCheckout(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  try {
    const requestIdentity = await getRequestIdentity();
    const authorized = authorizeLocalCommerceHarness({
      request,
      requestIdentity,
      requireOriginHeader: true,
      requireOwner: true,
    });
    const { sessionId } = await context.params;
    if (
      authorized === null ||
      authorized.ownerUserId === null ||
      !canonicalSessionId(sessionId)
    ) return localHarnessNotFound();
    const result = authorized.driver.commerce.completeWithInternallySignedEvent({
      ownerUserId: authorized.ownerUserId,
      sessionId,
      secret: authorized.secret,
    });
    return result === null
      ? localHarnessNotFound()
      : Response.redirect(`${authorized.origin}/checkout/success/${result.orderId}`, 303);
  } catch {
    return localHarnessNotFound();
  }
}

export async function returnFromSyntheticHostedCheckout(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  try {
    const requestIdentity = await getRequestIdentity();
    const authorized = authorizeLocalCommerceHarness({
      request,
      requestIdentity,
      requireOriginHeader: true,
      requireOwner: true,
    });
    const { sessionId } = await context.params;
    if (
      authorized === null ||
      authorized.ownerUserId === null ||
      !canonicalSessionId(sessionId)
    ) return localHarnessNotFound();
    const result = authorized.driver.commerce.returnWithoutEvent({
      ownerUserId: authorized.ownerUserId,
      sessionId,
    });
    return result === null
      ? localHarnessNotFound()
      : Response.redirect(`${authorized.origin}/checkout/success/${result.orderId}`, 303);
  } catch {
    return localHarnessNotFound();
  }
}
