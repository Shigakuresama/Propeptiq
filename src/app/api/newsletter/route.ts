import { createNewsletterPostHandler } from "@/newsletter/server";

const productionPOST = createNewsletterPostHandler();

export async function POST(request: Request): Promise<Response> {
  return productionPOST(request);
}
