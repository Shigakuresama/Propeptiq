import {
  getSyntheticHostedCheckout,
  type SyntheticHostedRouteContext,
} from "local-commerce-harness-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  return getSyntheticHostedCheckout(request, context);
}
