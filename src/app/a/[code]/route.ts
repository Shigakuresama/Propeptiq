import { NextResponse } from "next/server";

import { readServerEnv } from "@/env";
import { createAffiliateLandingRuntime } from "@/growth/affiliate-landing-runtime";
import { createAttributionCookie } from "@/growth/attribution-cookie";
import { readAttributionCallerAddress } from "@/growth/landing-rate-limit";

export const dynamic = "force-dynamic";

const boundedOpaqueCodePattern = /^aff_[A-Za-z0-9_-]{16,64}$/u;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;

type AffiliateRouteContext = Readonly<{
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
  request: Request,
  context: AffiliateRouteContext,
): Promise<Response> {
  const response = trustedCatalogRedirect();
  if (!response) return unavailableResponse();
  try {
    const { code } = await context.params;
    if (!boundedOpaqueCodePattern.test(code)) return response;

    const runtime = await createAffiliateLandingRuntime();
    if (!runtime) return response;
    const callerAddress = readAttributionCallerAddress(request, runtime.environment);
    if (!callerAddress) return response;

    const now = new Date();
    const eligible = await runtime.lookup({ code, now, callerAddress });
    if (
      !eligible ||
      eligible.program !== "affiliate" ||
      eligible.code !== code ||
      eligible.attributionDays !== 30
    ) {
      return response;
    }

    const expiresAt = new Date(
      now.getTime() + eligible.attributionDays * millisecondsPerDay,
    );
    const cookie = createAttributionCookie(
      {
        schemaVersion: 1,
        program: "affiliate",
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
