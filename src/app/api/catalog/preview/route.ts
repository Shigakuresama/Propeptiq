import { NextResponse } from "next/server";

import { buildCartPreview } from "@/cart/preview";

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
  // Canonical variant facts are not yet exposed by the public browse catalog.
  // Until Task 5 installs the server variant checkout boundary, every browser
  // cart line remains unavailable rather than being mapped from a product.
  const preview = buildCartPreview(items, { variants: [] }, previousPreviewToken);

  return NextResponse.json(preview, {
    headers: { "Cache-Control": "no-store" },
  });
}
