import "server-only";
import { createHash } from "node:crypto";
import type { ShippingQuotePort, QuoteUnavailableReason } from "./checkout-ports";
import { estimateCatalogPacking, qualifiesForFreeGround, SHIPPING_ORIGIN_ZIP } from "./shipping-packing";

/** Official USPS OAuth + Domestic Prices v3. Returns no invented fallback rates. */
export function createUspsShippingQuotePort(config: Readonly<{
  clientId?: string | undefined; clientSecret?: string | undefined; testMode: boolean;
}>): ShippingQuotePort {
  const base = config.testMode ? "https://apis-tem.usps.com" : "https://apis.usps.com";
  const unavailable = (reason: QuoteUnavailableReason) => ({ status: "unavailable" as const, reason });
  return {
    async quoteShipping(request) {
      if (request.destination.countryCode !== "US") return unavailable("unsupported_destination");
      const packing = estimateCatalogPacking(request.items);
      if (!packing) return unavailable("configuration_unavailable");
      const selected = request.shippingService ?? "ground_advantage";
      const mailClass = selected === "priority_mail" ? "PRIORITY_MAIL" : "USPS_GROUND_ADVANTAGE";
      const service = selected === "priority_mail" ? "USPS Priority Mail" : "USPS Ground Advantage";
      const reference = createHash("sha256").update(JSON.stringify({ packing, selected, binding:request.bindingHash })).digest("hex");
      if (qualifiesForFreeGround(selected, request.merchandiseTotalMinor)) return {
        status:"ready",bindingHash:request.bindingHash,reference:`free_ground_${reference}`,
        service,amountMinor:0,currency:"USD",
      };
      if (!config.clientId || !config.clientSecret) return unavailable("configuration_unavailable");
      try {
        const tokenResponse = await fetch(`${base}/oauth2/v3/token`, {
          method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({client_id:config.clientId,client_secret:config.clientSecret,grant_type:"client_credentials"}),
        });
        if (!tokenResponse.ok) return unavailable(tokenResponse.status < 500 ? "configuration_unavailable" : "temporarily_unavailable");
        const token = await tokenResponse.json();
        if (typeof token.access_token !== "string" || !token.access_token) return unavailable("temporarily_unavailable");
        const response = await fetch(`${base}/prices/v3/base-rates/search`, {
          method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
          headers:{"Content-Type":"application/json",Authorization:`Bearer ${token.access_token}`},
          body:JSON.stringify({originZIPCode:SHIPPING_ORIGIN_ZIP,destinationZIPCode:request.destination.postalCode.slice(0,5),
            weight:packing.weightPounds,length:packing.length,width:packing.width,height:packing.height,
            mailClass,processingCategory:packing.weightPounds < 0.375 ? "NONSTANDARD" : "MACHINABLE",
            destinationEntryFacilityType:"NONE",rateIndicator:"SP",priceType:"RETAIL"}),
        });
        if (!response.ok) return unavailable(response.status < 500 ? "configuration_unavailable" : "temporarily_unavailable");
        const body = await response.json();
        if (typeof body.totalBasePrice !== "number" || !Number.isFinite(body.totalBasePrice) || body.totalBasePrice <= 0 ||
          !Array.isArray(body.rates) || body.rates.length !== 1 || body.rates[0].mailClass !== mailClass ||
          body.rates[0].priceType !== "RETAIL") return unavailable("temporarily_unavailable");
        const amountMinor = Math.round(body.totalBasePrice * 100);
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return unavailable("temporarily_unavailable");
        return {status:"ready",bindingHash:request.bindingHash,reference:`usps_${reference}`,service,amountMinor,currency:"USD"};
      } catch { return unavailable("temporarily_unavailable"); }
    },
  };
}
