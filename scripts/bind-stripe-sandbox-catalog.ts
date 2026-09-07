import { readFileSync } from "node:fs";
import pg from "pg";
import { storefrontCatalogDecisionManifest } from "../src/catalog/storefront-catalog-manifest";

// A separate, explicit sandbox-only operation. Never uses DATABASE_URL.
if (process.env.APP_ENV !== "preview" || process.env.VERCEL_ENV === "production" ||
  process.env.PAYMENTS_MODE !== "test" || process.env.DATABASE_MODE !== "test" ||
  process.env.TEST_DATABASE_CONFIRMATION !== "isolated-test-database" ||
  !process.env.TEST_DATABASE_URL || process.env.STRIPE_ACCOUNT_ID !== "acct_1U9t8NR4u3cqLvC0") {
  throw new Error("Confirmed isolated Preview database and sandbox account required");
}
const report = JSON.parse(readFileSync(new URL("../docs/deployment/stripe-sandbox-catalog.json", import.meta.url), "utf8"));
if(report.livemode !== false || report.accountId !== process.env.STRIPE_ACCOUNT_ID || report.variants.length !== 103) throw new Error("Mapping evidence mismatch");
const client = new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
const changed: string[] = [];
try {
  await client.connect();
  await client.query("BEGIN");
  for (const variant of storefrontCatalogDecisionManifest.variants) {
    const mappings = report.variants.filter((entry: {variantId:string}) => entry.variantId === variant.id);
    if(mappings.length !== 1) throw new Error("Mapping missing or duplicated");
    const mapping=mappings[0];
    if(typeof mapping.stripeProductId !== "string" || !mapping.stripeProductId.startsWith("prod_") ||
      (variant.decisionStatus === "approved_candidate"
        ? typeof mapping.stripePriceId !== "string" || !mapping.stripePriceId.startsWith("price_")
        : mapping.stripePriceId !== null)) throw new Error("Invalid provider binding");
    const locked=await client.query(`SELECT v.sku,v.package_quantity,v.stripe_product_id,v.stripe_price_id
      FROM product_variants v WHERE v.id=$1::uuid FOR UPDATE`,[variant.id]);
    if(locked.rows.length!==1 || locked.rows[0].sku!==variant.sku || locked.rows[0].package_quantity!==variant.packageQuantity) throw new Error("Database catalog identity mismatch");
    const price=await client.query(`SELECT amount_minor,currency FROM product_prices WHERE variant_id=$1::uuid AND superseded_at IS NULL AND effective_at<=now() FOR UPDATE`,[variant.id]);
    if(variant.decisionStatus === "approved_candidate"
      ? price.rows.length!==1 || Number(price.rows[0].amount_minor)!==variant.baseUnitMinor || price.rows[0].currency!=="USD"
      : price.rows.length!==0) throw new Error("Database price mismatch");
    const previous=locked.rows[0];
    if((previous.stripe_product_id && previous.stripe_product_id!==mapping.stripeProductId) || (previous.stripe_price_id && previous.stripe_price_id!==mapping.stripePriceId)) throw new Error("Existing mapping conflict");
    if(previous.stripe_product_id===mapping.stripeProductId && previous.stripe_price_id===mapping.stripePriceId)continue;
    await client.query("UPDATE product_variants SET stripe_product_id=$2,stripe_price_id=$3 WHERE id=$1::uuid",[variant.id,mapping.stripeProductId,mapping.stripePriceId]);
    changed.push(variant.id);
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({operation:"bind-stripe-sandbox-catalog",accountId:report.accountId,changed}));
} catch {
  await client.query("ROLLBACK").catch(()=>{});
  throw new Error("Sandbox binding failed; transaction rolled back. Inspect catalog identity, price and isolation configuration.");
} finally { await client.end(); }
