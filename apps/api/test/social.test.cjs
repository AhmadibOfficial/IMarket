require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ApiController}=require('../dist/api.controller');
const {AuthGuard}=require('../dist/auth.guard');
const id='12345678-1234-4234-8234-123456789abc';
const req={principal:{id:'buyer',role:'buyer'}};
test('group checkout rejects invalid IDs, forged totals and reserved direct-order keys before SQL',async()=>{
 const api=new ApiController({pool:{connect(){throw Error('Unexpected database access');}}});
 for(const [group,body] of [['bad',{}],[id,{totalKobo:1}],[id,{accountId:'other'}]])
  await assert.rejects(api.groupCheckout(group,body,req),e=>e.getStatus()===400);
 await assert.rejects(api.checkout({productId:id,quantity:1,idempotencyKey:'group_'+id},req),e=>e.getStatus()===400);
});
test('group checkout requires buyer authorization and applies mutation quota',async()=>{
 for(const role of ['buyer','merchant','admin']) {
  let limits=0;
  const guard=new AuthGuard({authenticate:async()=>({id:'synthetic',role}),requireRole(p,r){if(p.role!==r)throw Error('Forbidden');},limit:async()=>{limits++;}});
  const context={switchToHttp:()=>({getRequest:()=>({method:'POST',headers:{}})}),getHandler:()=>({name:'groupCheckout'}),getClass:()=>({name:'ApiController'})};
  if(role==='buyer'){assert.equal(await guard.canActivate(context),true);assert.equal(limits,1);}
  else {await assert.rejects(guard.canActivate(context));assert.equal(limits,0);}
 }
});
test('group reservation transfer uses server price, audit and no additional stock debit',async()=>{
 const queries=[];
 const client={release(){},async query(sql){queries.push(sql);
  if(sql==='SELECT * FROM campaigns WHERE id=$1 FOR UPDATE')return {rowCount:1,rows:[{id,product_id:id,lifecycle:'confirmed'}]};
  if(sql.includes('SELECT * FROM campaign_members'))return {rowCount:1,rows:[{inventory_reserved:true}]};
  if(sql.includes('SELECT * FROM demo_orders'))return {rowCount:0,rows:[]};
  if(sql.includes('SELECT group_price_kobo'))return {rowCount:1,rows:[{group_price_kobo:'800'}]};
  if(sql.includes('INSERT INTO demo_orders'))return {rows:[{id,total_kobo:'800'}]};
  return {rows:[],rowCount:1};
 }};
 const result=await new ApiController({pool:{connect:async()=>client}}).groupCheckout(id,{},req);
 assert.equal(result.total_kobo,'800');assert.equal(result.paymentCaptured,false);
 assert(queries.some(q=>q.includes('marketplace_audit')));
 assert(queries.some(q=>q.includes('inventory_reserved=false')));
 assert(!queries.some(q=>q.includes('stock_demo=stock_demo-')));
 assert.equal(queries.at(-1),'COMMIT');
});
test('group checkout rolls back when membership or product availability fails',async()=>{
 for(const failure of ['membership','product','audit']) {
  const queries=[];
  const client={release(){},async query(sql){queries.push(sql);
   if(sql==='SELECT * FROM campaigns WHERE id=$1 FOR UPDATE')return {rowCount:1,rows:[{id,product_id:id,lifecycle:'confirmed'}]};
   if(sql.includes('SELECT * FROM campaign_members'))return {rowCount:failure==='membership'?0:1,rows:[{inventory_reserved:true}]};
   if(sql.includes('SELECT * FROM demo_orders'))return {rowCount:0,rows:[]};
   if(sql.includes('SELECT group_price_kobo'))return {rowCount:failure==='product'?0:1,rows:[{group_price_kobo:'800'}]};
   if(sql.includes('INSERT INTO demo_orders'))return {rows:[{id,total_kobo:'800'}]};
   if(sql.includes('INSERT INTO marketplace_audit'))throw Error('Synthetic audit failure');
   return {rows:[],rowCount:1};
  }};
  await assert.rejects(new ApiController({pool:{connect:async()=>client}}).groupCheckout(id,{},req),e=>failure==='audit'?e.message==='Synthetic audit failure':e.getStatus()===409);
  assert.equal(queries.at(-1),'ROLLBACK');assert(!queries.includes('COMMIT'));
 }
});
test('group mutations reject malformed bodies and customer price overrides before SQL',async()=>{
 const api=new ApiController({pool:{query(){throw Error('Unexpected database access');},connect(){throw Error('Unexpected database access');}}});
 for(const body of [null,[],{priceKobo:1},{productId:id,minMembers:2,maxMembers:1,durationHours:1},{productId:id,minMembers:2,maxMembers:4,durationHours:0}])
  await assert.rejects(api.create(body,req),e=>e.getStatus()===400);
 for(const body of [null,[],{demoAlias:'bad alias'},{demoAlias:'demo_safe',groupPriceKobo:1}])
  await assert.rejects(api.join(id,body,req),e=>e.getStatus()===400);
});
test('pending and unsuccessful groups never insert orders or consume additional stock',async()=>{
 for(const lifecycle of ['open','expired','cancelled']) {
  const queries=[];
  const client={release(){},async query(sql){queries.push(sql);
   if(sql==='SELECT * FROM campaigns WHERE id=$1 FOR UPDATE')return {rowCount:1,rows:[{id,product_id:id,lifecycle,expires_at:new Date(Date.now()+3600000)}]};
   if(sql.includes('SELECT * FROM campaign_members'))return {rowCount:1,rows:[{inventory_reserved:lifecycle==='open'}]};
   if(sql.includes('SELECT * FROM demo_orders'))return {rowCount:0,rows:[]};
   if(sql.includes('clock_timestamp()'))return {rows:[{elapsed:false}]};
   if(/INSERT|UPDATE/.test(sql) && !sql.startsWith('SELECT'))throw Error('Unexpected mutation');
   return {rows:[]};
  }};
  const result=await new ApiController({pool:{connect:async()=>client}}).groupCheckout(id,{},req);
  assert.equal(result.orderCreated,false);assert.equal(result.paymentCaptured,false);assert.equal(result.state,lifecycle);
  assert.equal(queries.at(-1),'COMMIT');
 }
});
test('group checkout replay returns persisted cancelled order without another reservation',async()=>{
 const queries=[];
 const prior={id:'owned-order',total_kobo:'9001',lifecycle:'cancelled'};
 const client={release(){},async query(sql,params){queries.push(sql);
  if(sql==='SELECT * FROM campaigns WHERE id=$1 FOR UPDATE')return {rowCount:1,rows:[{id,product_id:id,lifecycle:'confirmed'}]};
  if(sql.includes('SELECT * FROM campaign_members'))return {rowCount:1,rows:[{inventory_reserved:false}]};
  if(sql.includes('SELECT * FROM demo_orders')){
   assert.deepEqual(params,['buyer','group_'+id]);return {rowCount:1,rows:[prior]};
  }
  if(sql!=='BEGIN' && sql!=='COMMIT')throw Error('Replay must not mutate or reprice');
  return {rows:[]};
 }};
 const result=await new ApiController({pool:{connect:async()=>client}}).groupCheckout(id,{},req);
 assert.deepEqual(result,{...prior,mode:'SIMULATED_ONLY',paymentCaptured:false});
 assert.equal(queries.at(-1),'COMMIT');
});
test('catalog filters validate before SQL and use parameterized literal discovery',async()=>{
 const calls=[];
 const api=new ApiController({pool:{async query(sql,values){calls.push({sql,values});return {rows:[{price_kobo:'1200',group_price_kobo:'900'}]};}}});
 for(const filters of [{q:['rice']},{category:{}},{minPriceKobo:'-1'},{maxPriceKobo:'1 OR true'},{minPriceKobo:'20',maxPriceKobo:'10'},{accountId:'other'}])
  await assert.rejects(api.products(filters),e=>e.getStatus()===400);
 assert.equal(calls.length,0);
 const result=await api.products({q:" %' OR true -- ",category:' Food ',minPriceKobo:'0',maxPriceKobo:'1500'});
 assert.deepEqual(calls[0].values,["%' OR true --",'Food',0,1500]);
 assert(!calls[0].sql.includes("OR true --"));
 assert(calls[0].sql.includes('strpos('));
 assert(calls[0].sql.includes("m.status='approved'"));
 assert.equal(result[0].price_kobo,1200);
});

test('merchant group creation requires its published, reviewed product and approved merchant',async()=>{
 let writes=0;
 const api=new ApiController({pool:{async query(sql,values){
  if(sql.startsWith('SELECT id FROM products')) {
   assert(sql.includes('merchant_id=$2'));
   assert(sql.includes('AND published'));
   assert(sql.includes("moderation='approved'"));
   assert(sql.includes("m.status='approved'"));
   assert.equal(values[1],'tenant');
   return {rowCount:0,rows:[]};
  }
  writes++;throw Error('Ineligible product must not create a group');
 }}});
 await assert.rejects(api.create({productId:id,minMembers:2,maxMembers:4,durationHours:1},{principal:{id:'merchant',merchant_id:'tenant'}}),e=>e.getStatus()===400);
 assert.equal(writes,0);
});
