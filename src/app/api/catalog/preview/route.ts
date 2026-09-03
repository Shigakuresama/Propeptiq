import { NextResponse } from "next/server";

import { getRequestIdentity } from "@/auth/server";
import { buildCartPreview } from "@/cart/preview";
import {
  composeCartPreviewSources,
  projectPublicStorefrontPreviewSource,
} from "@/cart/storefront-preview-source";
import { getPublicStorefrontView } from "@/catalog/storefront-public-server";
import { isSyntheticLocalCommerceEnvironmentConfigured } from "@/config/commerce-capability";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

function invalidRequest(message: string) {
  return NextResponse.json(
    { error: "invalid_request", message },
    { status: 400, headers: noStoreHeaders },
  );
}

function unavailable() {
  return NextResponse.json(
    {
      error: "cart_preview_unavailable",
      message: "The cart preview is temporarily unavailable.",
    },
    { status: 503, headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return invalidRequest("A JSON cart request is required.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalidRequest("A cart request object is required.");
  }

  const items = Reflect.get(payload, "items");
  const previousValue = Reflect.get(payload, "previousPreviewToken");
  const previousPreviewToken =
    typeof previousValue === "string" && /^[a-f0-9]{64}$/.test(previousValue)
      ? previousValue
      : null;
  try {
    // Defer both calls so a synchronous throw by either dependency cannot skip
    // the other request-scoped acquisition.
    const [view, requestIdentity] = await Promise.all([
      Promise.resolve().then(() => getPublicStorefrontView()),
      Promise.resolve().then(() => getRequestIdentity()),
    ]);
    const publicSource = projectPublicStorefrontPreviewSource(view);
    const localSource =
      requestIdentity.localDriver !== null &&
      isSyntheticLocalCommerceEnvironmentConfigured(requestIdentity.environment)
        ? requestIdentity.localDriver.commerce.cartPreviewSource()
        : null;
    const source = localSource === null
      ? composeCartPreviewSources(publicSource)
      : composeCartPreviewSources(publicSource, localSource);
    const preview = buildCartPreview(items, source, previousPreviewToken);

    return NextResponse.json(preview, { headers: noStoreHeaders });
  } catch {
    return unavailable();
  }
}
