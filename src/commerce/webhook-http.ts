import "server-only";

import type { ProviderEventIngressResultV1 } from "@/commerce/provider-event-service";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

type DeliveryResult =
  | ProviderEventIngressResultV1
  | Readonly<{ status: "processed" | "deferred" | "conflict" | "lease_lost" | "retryable_failure" }>;

function json(status: number, publicStatus: string, retry = false) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  if (retry) headers.set("retry-after", "5");
  return new Response(JSON.stringify({ status: publicStatus }), { status, headers });
}

function mapResult(value: unknown): Response {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return json(503, "retryable", true);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "status") return json(503, "retryable", true);
    const status = (value as Record<string, unknown>).status;
    if (status === "processed") return json(200, "processed");
    if (status === "deferred") return json(202, "deferred");
    if (status === "conflict") return json(409, "conflict");
    if (status === "invalid_delivery") return json(400, "invalid_delivery");
    if (status === "unavailable") return json(503, "unavailable", true);
    if (status === "busy" || status === "lease_lost" || status === "retryable_failure") return json(503, "retryable", true);
  } catch {
    // Collapse hostile getters and cyclic dependency values.
  }
  return json(503, "retryable", true);
}

export function createWebhookHttpHandler(dependencies: Readonly<{
  handleDelivery: (input: Readonly<{
    exactPayload: Uint8Array;
    signature: unknown;
  }>) => Promise<DeliveryResult>;
}>) {
  return async function handleWebhook(request: Request): Promise<Response> {
    const signature = request.headers.get("stripe-signature");
    if (signature === null || signature.length === 0 || signature.length > 8_192) return json(400, "invalid_delivery");
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_WEBHOOK_BYTES)) return json(400, "invalid_delivery");
    try {
      const exactPayload = new Uint8Array(await request.arrayBuffer());
      if (exactPayload.byteLength === 0 || exactPayload.byteLength > MAX_WEBHOOK_BYTES) return json(400, "invalid_delivery");
      return mapResult(await dependencies.handleDelivery({ exactPayload, signature }));
    } catch {
      return json(503, "retryable", true);
    }
  };
}
