import { createProductionNewsletterPostHandler } from "@/newsletter/runtime";

const productionPOST = createProductionNewsletterPostHandler();

export async function POST(request: Request): Promise<Response> {
  return productionPOST(request);
}
