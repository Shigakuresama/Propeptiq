import { createProductionNewsletterPostHandler } from "@/newsletter/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    return await createProductionNewsletterPostHandler()(request);
  } catch {
    return Response.json({ status: "NEWSLETTER_NOT_CONFIGURED" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
