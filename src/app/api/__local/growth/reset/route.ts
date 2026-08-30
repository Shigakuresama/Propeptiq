import { getRequestIdentity } from "@/auth/server";
import { authorizeLocalCommerceHarness, localHarnessJson, localHarnessNotFound } from "@/commerce/local-harness-http";

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
    if (authorized === null) return localHarnessNotFound();
    const body = await request.json();
    if (
      typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, "scenario") ||
      (Reflect.get(body, "scenario") !== "active" && Reflect.get(body, "scenario") !== "inactive")
    ) return localHarnessNotFound();
    return localHarnessJson(authorized.driver.growth.reset(Reflect.get(body, "scenario")));
  } catch {
    return localHarnessNotFound();
  }
}
