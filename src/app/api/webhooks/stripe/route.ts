import { createStripeWebhookServerRuntime } from "@/commerce/server-runtime";
import { createWebhookHttpHandler } from "@/commerce/webhook-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let eventRuntime: Awaited<ReturnType<typeof createStripeWebhookServerRuntime>> = null;
  try {
    eventRuntime = await createStripeWebhookServerRuntime();
  } catch {
    eventRuntime = null;
  }
  const handler = createWebhookHttpHandler({
    handleDelivery: eventRuntime?.handleDelivery ?? (async () => Object.freeze({
      status: "unavailable" as const,
    })),
  });
  return handler(request);
}
