import { NextResponse } from "next/server";

import { getRequestIdentity } from "@/auth/server";
import { buildCartPreview } from "@/cart/preview";
import { resolvePricePresentationMode } from "@/catalog/storefront-public-server";
import { isSyntheticLocalCommerceEnvironmentConfigured } from "@/config/commerce-capability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "A JSON cart request is required." },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { error: "invalid_request", message: "A cart request object is required." },
      { status: 400 },
    );
  }

  const items = Reflect.get(payload, "items");
  const previousValue = Reflect.get(payload, "previousPreviewToken");
  const previousPreviewToken =
    typeof previousValue === "string" && /^[a-f0-9]{64}$/.test(previousValue)
      ? previousValue
      : null;
  const requestIdentity = await getRequestIdentity();
  const localTestSource =
    requestIdentity.localDriver !== null &&
    isSyntheticLocalCommerceEnvironmentConfigured(requestIdentity.environment)
      ? requestIdentity.localDriver.commerce.cartPreviewSource()
      : { variants: [] };
  // Production and Preview remain browse-only until canonical database variant
  // facts are approved; only the exact local/test guard exposes its fixture.
  const preview = buildCartPreview(items, {
    mode: resolvePricePresentationMode(requestIdentity.environment, { nodeEnv: process.env.NODE_ENV }),
    variants: localTestSource.variants,
  }, previousPreviewToken);

  return NextResponse.json(preview, {
    headers: { "Cache-Control": "no-store" },
  });
}
