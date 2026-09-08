/** Real HTTP requests using synthetic sandbox account/address data, never production. */
import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
const origin="https://propeptiq-git-feat-stripe-shipping-catalog-sergiosteam.vercel.app";
const credentials=JSON.parse(readFileSync(new URL("../../.codex-evidence/sandbox-buyer.json",import.meta.url),"utf8"));
const access=JSON.parse(readFileSync(new URL("../../.codex-evidence/browser-access.json",import.meta.url),"utf8"));
let cookie="";
async function post(path:string,body:unknown,authenticated=true){
 const response=await fetch(origin+path,{method:"POST",headers:{"content-type":"application/json",origin,"x-vercel-protection-bypass":access.bypass,"idempotency-key":randomUUID(),...(authenticated&&cookie?{cookie}:{})},body:JSON.stringify(body)});
 return {response,body:await response.json()};
}
const login=await post("/api/auth/sign-in/email",{email:credentials.email,password:credentials.password});
if(login.response.status!==200)throw Error(`Sandbox sign-in failed: ${login.response.status}`);
cookie=login.response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
if(!cookie)throw Error("Missing sandbox session cookie");
const payload={items:[{variantId:"e10294a1-d79c-51a1-9137-ff69d2a9e762",quantity:11}],destination:{recipientName:"SYNTHETIC SANDBOX BUYER",line1:"123 Synthetic Test Lane",line2:null,city:"Huntington Beach",stateCode:"CA",postalCode:"92647",countryCode:"US"}};
try{
 const unauthorized=await post("/api/checkout/quote",payload,false);
 console.log(JSON.stringify({check:"anonymous-quote",http:unauthorized.response.status,status:unauthorized.body.status}));
 const quote=await post("/api/checkout/quote",payload);
 console.log(JSON.stringify({check:"sandbox-quote",http:quote.response.status,...quote.body}));
 if(quote.response.status!==200||quote.body.quote?.status!=="ready")throw Error("Sandbox quote did not reach ready");
 if(quote.body.quote.shippingMinor!==0||quote.body.quote.discountMinor<=0)throw Error("Free shipping or promotion verification failed");
 const paidShipping=await post("/api/checkout/quote",{...payload,shippingService:"priority_mail"});
 console.log(JSON.stringify({check:"paid-shipping",http:paidShipping.response.status,status:paidShipping.body.status,component:paidShipping.body.component}));
 if(paidShipping.response.status!==503||paidShipping.body.component!=="shipping")throw Error("Expected truthful missing USPS configuration");
 const session=await post("/api/checkout/sessions",{...payload,pricingRevision:quote.body.pricingRevision});
 const sessionBody={...session.body};delete sessionBody.url;delete sessionBody.redirectUrl;delete sessionBody.checkoutUrl;delete sessionBody.hostedUrl;
 console.log(JSON.stringify({check:"sandbox-session",http:session.response.status,...sessionBody}));
 writeFileSync(new URL("../../.codex-evidence/sandbox-checkout.json",import.meta.url),JSON.stringify({quote:quote.body,session:session.body},null,2),{mode:0o600});
 if(session.response.status!==200||session.body.status!=="open")throw Error("Stripe test session did not open");
}finally{await post("/api/auth/sign-out",{});}

