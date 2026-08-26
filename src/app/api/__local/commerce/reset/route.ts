import { getRequestIdentity } from "@/auth/server";
import {
  authorizeLocalCommerceHarness,
  localHarnessJson,
  localHarnessNotFound,
} from "@/commerce/local-harness-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const requestIdentity = await getRequestIdentity();
    const authorized = authorizeLocalCommerceHarness({
      request,
      requestIdentity,
      requireOriginHeader: true,
      requireOwner: false,
    });
    return authorized === null
      ? localHarnessNotFound()
      : localHarnessJson(authorized.driver.commerce.reset());
  } catch {
    return localHarnessNotFound();
  }
}
