import { NextResponse } from "next/server";

import { buildCartPreview } from "@/cart/preview";
import { getPublicCatalog } from "@/catalog/server";

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
  const catalog = await getPublicCatalog();
  const preview = buildCartPreview(items, catalog, previousPreviewToken);

  return NextResponse.json(preview, {
    headers: { "Cache-Control": "no-store" },
  });
}
