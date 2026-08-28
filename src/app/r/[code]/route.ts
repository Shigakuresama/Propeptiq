import { NextResponse } from "next/server";

import { readServerEnv } from "@/env";
import { createAttributionCookie } from "@/growth/attribution-cookie";
import { createReferralLandingRuntime } from "@/growth/referral-landing-runtime";

export const dynamic = "force-dynamic";

const boundedOpaqueCodePattern = /^ref_[A-Za-z0-9_-]{16,64}$/u;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;

type ReferralRouteContext = Readonly<{
  params: Promise<Readonly<{ code: string }>>;
}>;

function trustedCatalogRedirect(): NextResponse | null {
  try {
    const { APP_ORIGIN: appOrigin } = readServerEnv();
    if (!appOrigin) return null;
    const response = NextResponse.redirect(
      new URL("/catalog", new URL(appOrigin).origin),
      303,
    );
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    return null;
  }
}

function unavailableResponse(): Response {
  return new Response(null, {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  context: ReferralRouteContext,
): Promise<Response> {
  const response = trustedCatalogRedirect();
  if (!response) return unavailableResponse();
  try {
    const { code } = await context.params;
    if (!boundedOpaqueCodePattern.test(code)) return response;

    const runtime = await createReferralLandingRuntime();
    if (!runtime) return response;

    const now = new Date();
    const eligible = await runtime.lookup({ code, now });
    if (!eligible || eligible.code !== code) return response;

    const expiresAt = new Date(
      now.getTime() + eligible.attributionDays * millisecondsPerDay,
    );
    const cookie = createAttributionCookie(
      {
        schemaVersion: 1,
        program: eligible.program,
        code: eligible.code,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      {
        environment: runtime.environment,
        now,
        secret: runtime.attributionSecret,
      },
    );
    if (!cookie) return response;

    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch {
    return response;
  }
}
