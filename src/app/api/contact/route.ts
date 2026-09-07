import { createProductionContactPostHandler } from "@/contact/runtime";

export async function POST(request: Request): Promise<Response> {
  try { return await createProductionContactPostHandler()(request); }
  catch { return Response.json({ status: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
