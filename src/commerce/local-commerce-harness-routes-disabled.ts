export type SyntheticHostedRouteContext = Readonly<{
  params: Promise<{ sessionId: string }>;
}>;

function unavailable(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function getSyntheticHostedCheckout(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  void request;
  void context;
  return unavailable();
}

export async function completeSyntheticHostedCheckout(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  void request;
  void context;
  return unavailable();
}

export async function returnFromSyntheticHostedCheckout(
  request: Request,
  context: SyntheticHostedRouteContext,
): Promise<Response> {
  void request;
  void context;
  return unavailable();
}
