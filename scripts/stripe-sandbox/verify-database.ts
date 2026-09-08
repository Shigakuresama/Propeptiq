import pg from "pg";
import { preparePostgresConnectionUrl } from "../../src/db/postgres-connection-url";
const raw=process.env.TEST_DATABASE_URL;
if(!raw||new URL(raw).pathname!=="/propeptiq_stripe_sandbox")throw new Error("Sandbox required");
const client=new pg.Client({connectionString:preparePostgresConnectionUrl(raw)});
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const catalog=await client.query(`SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    (SELECT count(*)::int FROM products) AS products,
    (SELECT count(*)::int FROM product_variants) AS variants,
    (SELECT count(*)::int FROM product_variants WHERE stripe_product_id IS NOT NULL) AS stripe_products,
    (SELECT count(*)::int FROM product_variants WHERE stripe_price_id IS NOT NULL) AS stripe_prices,
    (SELECT count(*)::int FROM product_prices) AS prices,
    (SELECT count(*)::int FROM orders) AS orders,
    (SELECT count(*)::int FROM lots) AS lots,
    (SELECT count(*)::int FROM promotions WHERE campaign_key='winter30' AND basis_points=3000 AND application_mode='automatic' AND enabled) AS automatic_promotions`);
  const events=await client.query("SELECT provider_event_id,event_type,status,livemode FROM provider_events ORDER BY received_at DESC LIMIT 10");
  const attempts=await client.query("SELECT id,order_id,status,permitted,provider_session_id,provider_livemode FROM checkout_attempts ORDER BY created_at DESC LIMIT 10");
  const orders=await client.query("SELECT id,state,total_minor FROM orders ORDER BY created_at DESC LIMIT 10");
  const reservations=await client.query("SELECT order_id,state,quantity_reserved,quantity_remaining FROM inventory_reservations ORDER BY created_at DESC LIMIT 10");
  await client.query("COMMIT");
  console.log(JSON.stringify({catalog:catalog.rows[0],events:events.rows,attempts:attempts.rows,orders:orders.rows,reservations:reservations.rows}));
} finally {await client.end();}
