import {
  checkoutRouteResponse,
  createCheckoutRouteHandlers,
  preflightCheckoutRoute,
} from "../route-dependencies";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const preflight = preflightCheckoutRoute(request, "session");
  if (preflight !== null) return preflight;
  try {
    const handlers = await createCheckoutRouteHandlers();
    return handlers.session(request);
  } catch {
    return checkoutRouteResponse("session", "unavailable");
  }
}
