import { describe, expect, it } from "vitest";
import { storefrontCatalogDecisionManifest } from "@/catalog/storefront-catalog-manifest";
import { estimateCatalogPacking, qualifiesForFreeGround } from "./shipping-packing";
import { createUspsShippingQuotePort } from "./usps-shipping-provider";

const small = storefrontCatalogDecisionManifest.variants.find(v => v.browseCode === "TR30")!;
const large = storefrontCatalogDecisionManifest.variants.find(v => v.browseCode === "BA10")!;
describe("owner-authorized shipping estimates", () => {
  it("uses sale-unit quantities rather than the source supplier's ten-vial package", () => {
    expect(estimateCatalogPacking([{productId:small.id,quantity:1}])).toMatchObject({vialCount:1,weightPounds:0.25,length:6,width:4,height:4});
    expect(estimateCatalogPacking([{productId:small.id,quantity:2,packageQuantity:10}])?.vialCount).toBe(20);
  });
  it("budgets more space and weight for liquid vials", () => {
    const a=estimateCatalogPacking([{productId:small.id,quantity:20}])!;
    const b=estimateCatalogPacking([{productId:large.id,quantity:20}])!;
    expect(b.weightPounds).toBeGreaterThan(a.weightPounds);
    expect(b.length*b.width*b.height).toBeGreaterThan(a.length*a.width*a.height);
  });
  it("rejects unknown products and quantities beyond the approved packing range", () => {
    expect(estimateCatalogPacking([])).toBeNull();
    expect(estimateCatalogPacking([{productId:small.id,quantity:21}])).toBeNull();
    expect(estimateCatalogPacking([{productId:small.id,quantity:0}])).toBeNull();
  });
  it("uses a strict post-discount threshold and never makes expedited delivery free", () => {
    for(const n of [19999,20000]) expect(qualifiesForFreeGround("ground_advantage",n)).toBe(false);
    expect(qualifiesForFreeGround("ground_advantage",20001)).toBe(true);
    expect(qualifiesForFreeGround("priority_mail",20001)).toBe(false);
  });
  it("returns the authorized free quote without credentials but refuses to invent paid rates", async () => {
    const port=createUspsShippingQuotePort({testMode:true});
    const request={schemaVersion:1 as const,bindingHash:"a".repeat(64),items:[{productId:small.id,quantity:1,netAmountMinor:20001}],merchandiseTotalMinor:20001,currency:"USD" as const,
      destination:{recipientName:"",line1:"",line2:null,city:"",stateCode:"CA",postalCode:"92647",countryCode:"US" as const}};
    expect(await port.quoteShipping(request)).toMatchObject({status:"ready",amountMinor:0,service:"USPS Ground Advantage"});
    expect(await port.quoteShipping({...request,shippingService:"priority_mail"})).toEqual({status:"unavailable",reason:"configuration_unavailable"});
    expect(await port.quoteShipping({...request,merchandiseTotalMinor:20000})).toEqual({status:"unavailable",reason:"configuration_unavailable"});
  });
});
