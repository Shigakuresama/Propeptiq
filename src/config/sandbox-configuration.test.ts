import {describe,expect,it} from "vitest";
import {parseServerEnv} from "./env-schema";
import {isSandboxCheckoutEnvironmentConfigured} from "./sandbox-configuration";

// Explicit synthetic credentials; no network is contacted by these configuration tests.
export const sandboxTestInput = {
 APP_ENV:"preview", VERCEL_ENV:"preview", APP_ORIGIN:"https://propeptiq-git-feat-stripe-shipping-catalog-sergiosteam.vercel.app",
 SANDBOX_CHECKOUT_CAPABILITY:"enabled", AUTH_MODE:"test", DATABASE_MODE:"test",PAYMENTS_MODE:"test",TAX_MODE:"test",SHIPPING_MODE:"test",FULFILLMENT_MODE:"test",EMAIL_MODE:"disabled",
 TEST_DATABASE_URL:"postgresql://synthetic:synthetic@ep-blue-frog-aubaovyb.c-10.us-east-1.aws.neon.tech/propeptiq_stripe_sandbox",TEST_DATABASE_CONFIRMATION:"isolated-test-database",
 STRIPE_ACCOUNT_ID:"acct_1U9t8NR4u3cqLvC0",STRIPE_SECRET_KEY:"sk_test_synthetic",STRIPE_WEBHOOK_SECRET:"whsec_synthetic",
 BETTER_AUTH_SECRET:"synthetic-auth-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",RATE_LIMIT_SECRET:"synthetic-rate-9876543210-ZYXWVUTSRQPONMLKJIHGFEDCBA",
} as const;
describe("isolated checkout sandbox",()=>{
 it("permits provisioned-account auth without production email credentials",()=>{expect(isSandboxCheckoutEnvironmentConfigured(parseServerEnv(sandboxTestInput))).toBe(true);});
 it.each([
  {APP_ENV:"production"},{VERCEL_ENV:"production"},{VERCEL_TARGET_ENV:"production"},{PAYMENTS_MODE:"live"},{STRIPE_SECRET_KEY:"sk_live_synthetic"},
  {TEST_DATABASE_URL:"postgresql://synthetic:synthetic@synthetic.neon.tech/neondb"},{TEST_DATABASE_CONFIRMATION:undefined},
  {EMAIL_MODE:"live"},{APP_ORIGIN:"https://propeptiq-ten.vercel.app"},{LOCAL_TEST_DRIVER:"enabled"},{COMMERCE_LIVE_CAPABILITY:"enabled"},
 ])("rejects an isolation escape %j",patch=>{expect(()=>parseServerEnv({...sandboxTestInput,...patch})).toThrow();});
 it("defaults closed",()=>expect(isSandboxCheckoutEnvironmentConfigured(parseServerEnv({}))).toBe(false));
});
