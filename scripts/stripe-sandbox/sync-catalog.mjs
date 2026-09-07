import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const catalog = JSON.parse(await readFile('catalog.json','utf8'));
const key = process.env.STRIPE_SECRET_KEY;
const owner = 'propeptiq-catalog-v1';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function api(path, data) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method:data ? 'POST':'GET', redirect:'error', signal:AbortSignal.timeout(25000),
    headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-07-29.dahlia',...(data?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`ppq-${hash([path,data])}`}:{})},
    ...(data?{body:new URLSearchParams(data)}:{}),
  });
  const body=await response.json();
  if(!response.ok) { const e = new Error(`Stripe status ${response.status}`); e.status=response.status; throw e; }
  return body;
}
const mappings=[];
try {
  if(process.env.VERCEL_ENV!=='preview'||!key?.startsWith('sk_test_')) throw new Error('Sandbox Preview required');
  const account=await api('account'); const balance=await api('balance');
  if(account.id!=='acct_1U9t8NR4u3cqLvC0'||balance.livemode!==false) throw new Error('Account fence failed');
  // Verify public images before making catalog changes.
  const imageResults=new Map();
  for(const url of new Set(catalog.products.map(p=>p.image))) {
    const r=await fetch(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});
    imageResults.set(url,r.ok&&r.headers.get('content-type')?.startsWith('image/'));
  }
  for(const item of catalog.products) {
    const id=`prod_ppq_${item.variantId.replaceAll('-','')}`;
    let existing=null;
    try {existing=await api(`products/${id}`);} catch(e){if(e.status!==404) throw e;}
    if(existing&&existing.metadata?.managed_by!==owner) throw new Error('Ownership mismatch');
    const data={name:item.name,active:String(item.priceMinor!==null),shippable:'true',unit_label:'vial',tax_code:'txcd_99999999',
      'metadata[managed_by]':owner,'metadata[variant_id]':item.variantId,'metadata[catalog_product_id]':item.productId,'metadata[sku]':item.sku,
      'metadata[package_quantity]':String(item.packageQuantity),'metadata[price_status]':item.priceStatus,
      'metadata[image_kind]':'conceptual_catalog_illustration','metadata[pricing_authority]':'application_server',
    };
    if(imageResults.get(item.image)) data['images[0]']=item.image;
    const product=await api(existing?`products/${id}`:'products',existing?data:{id,...data});
    let priceId=null;
    if(item.priceMinor!==null) {
      const lookup=`ppq_${item.variantId}_usd_${item.priceMinor}_v1`;
      const prices=await api(`prices?lookup_keys[]=${encodeURIComponent(lookup)}&limit=2`);
      if(prices.data.length>1)throw new Error('Ambiguous price');
      let price=prices.data[0];
      if(!price) price=await api('prices',{product:id,currency:'usd',unit_amount:String(item.priceMinor),lookup_key:lookup,'metadata[managed_by]':owner,'metadata[variant_id]':item.variantId});
      if(price.product!==id||price.unit_amount!==item.priceMinor||price.currency!=='usd'||!price.active||price.livemode)throw new Error('Price readback mismatch');
      priceId=price.id;
      await api(`products/${id}`,{default_price:priceId});
    }
    if(product.livemode||product.name!==item.name||product.active!==(item.priceMinor!==null))throw new Error('Product readback mismatch');
    const mapping={variantId:item.variantId,stripeProductId:id,stripePriceId:priceId,imageAttached:product.images?.includes(item.image)===true};
    mappings.push(mapping);
    console.log('STRIPE_CATALOG_ITEM '+JSON.stringify(mapping));
  }
  const couponSpecs=[{id:'ppq_winter30_v1',name:'Winter Sale — 30%',percent:30},...catalog.quantityTiers.filter(t=>t.discountBps>0).map(t=>({id:`ppq_bulk_${t.minBottleCount}_v1`,name:`Bulk ${t.minBottleCount}${t.maxBottleCount?'-'+t.maxBottleCount:'+'} bottles — ${t.discountBps/100}%`,percent:t.discountBps/100}))];
  for(const c of couponSpecs){
    let coupon=null;try{coupon=await api(`coupons/${c.id}`);}catch(e){if(e.status!==404)throw e;}
    if(!coupon)coupon=await api('coupons',{id:c.id,name:c.name,duration:'once',percent_off:String(c.percent),'metadata[managed_by]':owner,'metadata[application]':'server_computed_do_not_apply_twice'});
    if(coupon.percent_off!==c.percent||coupon.metadata?.managed_by!==owner||!coupon.valid)throw new Error('Coupon mismatch');
    console.log('STRIPE_CATALOG_COUPON '+JSON.stringify({id:coupon.id,percentOff:coupon.percent_off}));
  }
  console.log('STRIPE_CATALOG_COMPLETE '+JSON.stringify({accountId:account.id,livemode:false,products:mappings.length,prices:mappings.filter(m=>m.stripePriceId).length,images:mappings.filter(m=>m.imageAttached).length,coupons:couponSpecs.length}));
}catch(e){console.log('STRIPE_CATALOG_FAILED '+JSON.stringify({completed:mappings.length,error:e instanceof Error?e.message:'unknown'}));process.exitCode=1;}
await mkdir('public',{recursive:true});await writeFile('public/index.html','<!doctype html><meta name="robots" content="noindex"><title>Private catalog setup</title><p>Results are recorded in private build logs.</p>');
