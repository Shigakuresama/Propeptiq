import {
  completeSyntheticHostedCheckout,
  type SyntheticHostedRouteContext,
} from "local-commerce-harness-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  return completeSyntheticHostedCheckout(request, context);
}
