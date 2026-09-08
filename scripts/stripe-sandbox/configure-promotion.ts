import pg from "pg";
import { WINTER30_STOREFRONT_PROMOTION as promotion } from "../../src/config/storefront-promotions";
import { preparePostgresConnectionUrl } from "../../src/db/postgres-connection-url";

const raw = process.env.TEST_DATABASE_URL;
if (!raw || process.env.TEST_DATABASE_CONFIRMATION !== "isolated-test-database" ||
  new URL(raw).pathname !== "/propeptiq_stripe_sandbox" || process.env.APP_ENV !== "preview") throw new Error("Confirmed sandbox required");
const client = new pg.Client({connectionString:preparePostgresConnectionUrl(raw)});
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(`INSERT INTO promotions(campaign_key,code,name,kind,status,basis_points,enabled,timezone,application_mode,scope)
    VALUES($1,$2,$3,'discount','active',$4,true,$5,$6,$7) ON CONFLICT(campaign_key) WHERE campaign_key IS NOT NULL DO NOTHING`,
    [promotion.id,promotion.displayCode,promotion.displayName,promotion.discountBps,promotion.timezone,promotion.applicationMode,promotion.scope.kind]);
  const rows=await client.query("SELECT code,name,basis_points,enabled,timezone,application_mode,scope,starts_at,ends_at FROM promotions WHERE campaign_key=$1",[promotion.id]);
  const value=rows.rows[0];
  if(rows.rows.length!==1||value.code!==promotion.displayCode||value.name!==promotion.displayName||value.basis_points!==promotion.discountBps||!value.enabled||value.timezone!==promotion.timezone||value.application_mode!==promotion.applicationMode||value.scope!==promotion.scope.kind||value.starts_at!==null||value.ends_at!==null)throw new Error("Existing promotion differs from canonical configuration");
  await client.query("COMMIT");
  console.log(JSON.stringify({operation:"configure-sandbox-promotion",campaign:promotion.id,discountBps:promotion.discountBps,applicationMode:promotion.applicationMode}));
} catch {
  await client.query("ROLLBACK").catch(()=>{});
  throw new Error("Sandbox promotion configuration failed; rolled back");
} finally {await client.end();}
