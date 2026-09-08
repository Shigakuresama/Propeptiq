import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { storefrontCatalogDecisionManifest as manifest } from "../../src/catalog/storefront-catalog-manifest";
import { browseCatalogProducts } from "../../src/catalog/browse-catalog";
import { preparePostgresConnectionUrl } from "../../src/db/postgres-connection-url";

// Deliberately bound to the empty database provisioned for PR 46.
const raw = process.env.TEST_DATABASE_URL;
if (!raw || process.env.TEST_DATABASE_CONFIRMATION !== "isolated-test-database") throw new Error("Sandbox confirmation required");
const target = new URL(raw);
if (target.pathname !== "/propeptiq_stripe_sandbox" || !target.hostname.endsWith(".neon.tech")) throw new Error("Unexpected sandbox target");
const client = new pg.Client({ connectionString: preparePostgresConnectionUrl(raw) });
try {
  await client.connect();
  await client.query("BEGIN");
  const tables = await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')");
  if (tables.rows[0].count !== 0) throw new Error("Bootstrap requires a completely empty database");
  const folder = new URL("../../src/db/migrations/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", folder), "utf8"));
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  for (const entry of journal.entries) {
    const sql = readFileSync(new URL(`${entry.tag}.sql`, folder), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)", [createHash("sha256").update(sql).digest("hex"), entry.when]);
  }
  const policy = await client.query("INSERT INTO product_policy_groups(slug,name) VALUES('sandbox-catalog','Sandbox catalog - no destination approval') RETURNING id");
  for (const product of manifest.products) {
    const source = browseCatalogProducts.find(value => value.slug === product.browseSlug);
    if (!source) throw new Error("Missing source catalog product");
    await client.query("INSERT INTO products(id,slug,name,package_form,material_identity,policy_group_id,status) VALUES($1,$2,$3,'vial',$3,$4,'draft')", [product.id,product.browseSlug,source.name,policy.rows[0].id]);
  }
  for (const variant of manifest.variants) {
    await client.query("INSERT INTO product_variants(id,product_id,sku,label,canonical_amount,amount_unit,package_quantity,status) VALUES($1,$2,$3,$4,$5,$6,$7,'inactive')", [variant.id,variant.productId,variant.sku,variant.publicLabel,variant.amount?.value ?? null,variant.amount?.unit ?? null,variant.packageQuantity]);
    if (variant.decisionStatus === "approved_candidate") {
      await client.query("INSERT INTO product_prices(product_id,variant_id,version,price_status,amount_minor,currency,effective_at) VALUES($1,$2,1,'active',$3,'USD',now())",[variant.productId,variant.id,variant.baseUnitMinor]);
    }
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({operation:"bootstrap-empty-sandbox",migrations:journal.entries.length,products:manifest.products.length,variants:manifest.variants.length,prices:manifest.variants.filter(v=>v.decisionStatus==="approved_candidate").length,inventoryCreated:0,customerRecordsCopied:0}));
} catch (error) {
  await client.query("ROLLBACK").catch(()=>{});
  console.error(JSON.stringify({status:"rolled_back",code:(error as {code?:string}).code ?? null,message: error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g,"[redacted]") : "Bootstrap failed"}));
  process.exitCode=1;
} finally {await client.end();}
