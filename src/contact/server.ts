import "server-only";

import { createHash } from "node:crypto";

import { readAuthCallerAddress } from "@/auth/caller-address";
import { parseContactInput, type ContactInput, type ContactResult } from "@/contact/contracts";
import type { ContactDeliveryStore } from "@/db/repositories/contact-delivery-store";
import type { ContactGateway } from "@/contact/resend-gateway";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import type { RuntimeDatabaseSession } from "@/db/runtime";
import { consumeFixedWindowLimit, createRateLimitScope } from "@/security/rate-limit";

// Includes UTF-8 and JSON escaping overhead for all permitted field lengths.
const maximumRequestBytes = 65_536;

export type ContactServerDependencies = Readonly<{
  appEnvironment: "local" | "preview" | "production";
  appOrigin: string;
  connect: () => Promise<RuntimeDatabaseSession>;
  createDeliveryStore: (session: RuntimeDatabaseSession) => ContactDeliveryStore;
  gateway: ContactGateway;
  now: () => Date;
  rateLimit: number;
  rateLimitSecret: string;
  rateLimitWindowSeconds: number;
}>;

function response(result: ContactResult, status: number): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

function exactOrigin(request: Request, expected: string): boolean {
  const supplied = request.headers.get("origin");
  try { return supplied !== null && supplied === new URL(supplied).origin && supplied === new URL(expected).origin; }
  catch { return false; }
}

function canonicalPayload(input: ContactInput): string {
  return JSON.stringify({
    email: input.email,
    message: input.message,
    name: input.name,
    orderReference: input.orderReference,
    subject: input.subject,
  });
}

async function bodyWithinLimit(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximumRequestBytes)) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximumRequestBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(joined);
  } catch {
    try { await reader.cancel(); } catch { /* request is already unusable */ }
    return null;
  }
}

export function createContactPostHandler(dependencies?: ContactServerDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!dependencies) return response({ status: "UNAVAILABLE" }, 503);
    if (!exactOrigin(request, dependencies.appOrigin)) return response({ status: "UNAVAILABLE" }, 403);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return response({ status: "INVALID", field: "request" }, 415);
    }
    let address: string | null;
    try { address = readAuthCallerAddress(request.headers, dependencies.appEnvironment); }
    catch { address = null; }
    if (!address) return response({ status: "UNAVAILABLE" }, 503);

    let session: RuntimeDatabaseSession;
    try { session = await dependencies.connect(); }
    catch { return response({ status: "UNAVAILABLE" }, 503); }
    try {
      const rateStore = createPostgresRateLimitStore(session);
      const decision = await consumeFixedWindowLimit({
        store: rateStore,
        scope: createRateLimitScope(address, "contact.submit", dependencies.rateLimitSecret),
        limit: dependencies.rateLimit,
        windowMs: dependencies.rateLimitWindowSeconds * 1_000,
        now: dependencies.now(),
      });
      if (!decision.allowed) return response({ status: "RATE_LIMITED" }, 429);

      const body = await bodyWithinLimit(request);
      if (body === null) return response({ status: "INVALID", field: "request" }, 413);
      let decoded: unknown;
      try { decoded = JSON.parse(body); } catch { return response({ status: "INVALID", field: "request" }, 400); }
      const parsed = parseContactInput(decoded);
      if (!parsed.success) return response({ status: "INVALID", field: parsed.field }, 400);
      if (parsed.data.website !== "") return response({ status: "INVALID", field: "request" }, 400);

      const requestHash = createHash("sha256").update(canonicalPayload(parsed.data)).digest("hex");
      const key = `contact/${parsed.data.requestId}`;
      const store = dependencies.createDeliveryStore(session);
      await session.query("BEGIN");
      let reservation: Awaited<ReturnType<ContactDeliveryStore["reserve"]>>;
      try {
        reservation = await store.reserve(key, requestHash, dependencies.now());
        await session.query("COMMIT");
      } catch (error) {
        try { await session.query("ROLLBACK"); } catch { /* closed response below */ }
        throw error;
      }
      if (reservation === "accepted") return response({ status: "ACCEPTED" }, 200);
      if (reservation !== "reserved") return response({ status: "UNAVAILABLE" }, reservation === "conflict" ? 409 : 503);

      let delivery: Awaited<ReturnType<ContactGateway["send"]>>;
      try { delivery = await dependencies.gateway.send(parsed.data, key); }
      catch { return response({ status: "UNAVAILABLE" }, 503); }
      if (!delivery.accepted) {
        await store.reject(key, requestHash);
        return response({ status: "UNAVAILABLE" }, 503);
      }
      const persisted = await store.accept(key, requestHash, delivery.providerId, dependencies.now());
      return persisted ? response({ status: "ACCEPTED" }, 200) : response({ status: "UNAVAILABLE" }, 503);
    } catch {
      return response({ status: "UNAVAILABLE" }, 503);
    } finally {
      try { session.release(); } catch { /* response remains safe */ }
    }
  };
}
