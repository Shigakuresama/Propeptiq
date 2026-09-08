/** Owner-authorized synthetic records, exclusively for the isolated PR 46 database. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import pg from "pg";
import {getMigrations} from "better-auth/db/migration";
import {hashPassword} from "better-auth/crypto";
import {preparePostgresConnectionUrl} from "../../src/db/postgres-connection-url";
import {storefrontCatalogDecisionManifest as manifest} from "../../src/catalog/storefront-catalog-manifest";

const raw=process.env.TEST_DATABASE_URL;
if(!raw||process.env.TEST_DATABASE_CONFIRMATION!=="isolated-test-database"||process.env.APP_ENV!=="preview"||new URL(raw).pathname!=="/propeptiq_stripe_sandbox"||new URL(raw).hostname!=="ep-blue-frog-aubaovyb.c-10.us-east-1.aws.neon.tech")throw Error("Confirmed isolated sandbox required");
const connectionString=preparePostgresConnectionUrl(raw,{requirePersistentSession:true});
const client=new pg.Client({connectionString});
const pool=new pg.Pool({connectionString,options:"-c search_path=neon_auth",max:1});
const credentialFile=new URL("../../.codex-evidence/sandbox-buyer.json",import.meta.url);
const credentials=existsSync(credentialFile)?JSON.parse(readFileSync(credentialFile,"utf8")):{email:"sandbox-buyer@propeptiq.invalid",password:randomBytes(24).toString("base64url")};
if(credentials.email!=="sandbox-buyer@propeptiq.invalid"||typeof credentials.password!=="string"||credentials.password.length<24)throw Error("Invalid local test credentials");
try {
 await client.connect();
 await client.query("CREATE SCHEMA IF NOT EXISTS neon_auth");
 const migration=await getMigrations({database:pool,emailAndPassword:{enabled:true},advanced:{database:{generateId:"uuid"}}});
 await migration.runMigrations();
 await client.query(readFileSync(new URL("../../src/auth/migrations/0001_rate_limit_windows.sql",import.meta.url),"utf8"));
 await client.query("BEGIN");
 const authId=randomUUID();
 const auth=await client.query(`INSERT INTO neon_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Synthetic Sandbox Buyer',$2,true,now(),now()) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[authId,credentials.email]);
 const userId=auth.rows[0].id;
 const account=await client.query(`SELECT id FROM neon_auth.account WHERE "userId"=$1 AND "providerId"='credential'`,[userId]);
 if(account.rows.length===0)await client.query(`INSERT INTO neon_auth.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,($2::uuid)::text,'credential',$2::uuid,$3,now(),now())`,[randomUUID(),userId,await hashPassword(credentials.password)]);
 const user=await client.query("INSERT INTO users(clerk_id,email_verified_at) VALUES($1,now()) ON CONFLICT(clerk_id) DO UPDATE SET email_verified_at=EXCLUDED.email_verified_at RETURNING id",[userId]);
 const buyerId=user.rows[0].id;
 await client.query("INSERT INTO buyer_profiles(user_id,status,age_confirmed_at,research_purpose,organization_name) VALUES($1,'active',now(),'analytical','SYNTHETIC SANDBOX - NOT A REAL BUYER') ON CONFLICT(user_id) DO NOTHING",[buyerId]);
 const policyText="SYNTHETIC SANDBOX ATTESTATION: This test account and inventory exist only to verify checkout software. No real buyer qualification, legal approval, material certification or shipment is represented.";
 const policy=await client.query("INSERT INTO attestation_versions(version,content_hash,policy_text,effective_at) VALUES(1,$1,$2,now()) ON CONFLICT(version) DO UPDATE SET version=EXCLUDED.version RETURNING id,content_hash",[createHash('sha256').update(policyText).digest('hex'),policyText]);
 if(policy.rows[0].content_hash!==createHash('sha256').update(policyText).digest('hex'))throw Error('Existing attestation mismatch');
 await client.query("INSERT INTO attestation_acceptances(user_id,attestation_version_id) VALUES($1,$2) ON CONFLICT(user_id,attestation_version_id) DO NOTHING",[buyerId,policy.rows[0].id]);
 const group=await client.query("UPDATE product_policy_groups SET name='SYNTHETIC SANDBOX - TEST DESTINATION RULES' WHERE slug='sandbox-catalog' RETURNING id");
 if(group.rows.length!==1)throw Error("Expected sandbox catalog group");
 const states="AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(' ');
 for(const state of states)await client.query("INSERT INTO destination_policies(scope_kind,policy_group_id,state_code,result,version,active,effective_at) VALUES('policy_group',$1,$2,'allowed',1,true,now()) ON CONFLICT DO NOTHING",[group.rows[0].id,state]);
 for(const variant of manifest.variants.filter(v=>v.decisionStatus==='approved_candidate')){
  const bound=await client.query("SELECT id FROM product_variants WHERE id=$1 AND stripe_price_id IS NOT NULL AND stripe_product_id IS NOT NULL",[variant.id]);
  if(bound.rows.length!==1)throw Error("Approved variant lacks sandbox Stripe binding");
  await client.query("INSERT INTO lots(product_id,variant_id,supplier_name,supplier_lot_code,received_quantity,available_quantity,status) VALUES($1,$2,'SYNTHETIC SANDBOX SUPPLIER',$3,100,100,'released') ON CONFLICT(product_id,supplier_name,supplier_lot_code) DO NOTHING",[variant.productId,variant.id,`SYNTHETIC-${variant.sku}-PR46`]);
  await client.query("UPDATE product_variants SET status='active' WHERE id=$1",[variant.id]);
  await client.query("UPDATE products SET status='active' WHERE id=$1",[variant.productId]);
 }
 await client.query("COMMIT");
 mkdirSync(new URL("../../.codex-evidence/",import.meta.url),{recursive:true});
 writeFileSync(credentialFile,JSON.stringify({...credentials,buyerId,authUserId:userId,notice:"Synthetic sandbox-only account. No production access."},null,2),{mode:0o600});
 console.log(JSON.stringify({status:"provisioned",syntheticBuyer:buyerId,syntheticLots:40,initialUnitsPerLot:100,destinations:states.length,credentialFile:".codex-evidence/sandbox-buyer.json"}));
}catch(error){await client.query("ROLLBACK").catch(()=>{}); console.error({status:"failed",code:(error as {code?:string}).code,message:error instanceof Error?error.message:"Provisioning failed"});process.exitCode=1;}
finally{await pool.end();await client.end();}
