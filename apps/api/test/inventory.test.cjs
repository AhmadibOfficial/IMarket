require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {transaction,createOrder}=require('../dist/inventory');
const {ApiController}=require('../dist/api.controller');
const productId='12345678-1234-4234-8234-123456789abc';
const req={principal:{id:'synthetic-account',role:'buyer',merchant_id:null}};
test('invalid order quantities and keys fail before acquiring database connections',async()=>{
  const api=new ApiController({pool:{connect(){throw Error('Unexpected storage access');}}});
  for(const quantity of [0,-1,11,1.5,'1',NaN,Number.MAX_SAFE_INTEGER+1]) {
    await assert.rejects(api.checkout({productId,quantity,idempotencyKey:'valid-demo-key'},req),e=>e.getStatus()===400);
  }
  for(const idempotencyKey of [undefined,null,123,'short','x'.repeat(81),'contains spaces']) {
    await assert.rejects(api.checkout({productId,quantity:1,idempotencyKey},req),e=>e.getStatus()===400);
  }
  for(const method of ['cancelOrder','cancelGroup','expireGroup']) {
    await assert.rejects(api[method]('invalid',{},req),e=>e.getStatus()===400);
    await assert.rejects(api[method](productId,{account_id:'other'},req),e=>e.getStatus()===400);
  }
});
test('transaction commits results and releases connections; storage failures roll back and propagate',async()=>{
  for(const failure of [null,new Error('synthetic storage failure')]) {
    const calls=[];
    const client={async query(sql){calls.push(sql);},release(){calls.push('release');}};
    const result=transaction({async connect(){return client;}},async()=>{
      if(failure) throw failure;
      return 'result';
    });
    if(failure) await assert.rejects(result,e=>e===failure);
    else assert.equal(await result,'result');
    assert.deepEqual(calls,['BEGIN',failure?'ROLLBACK':'COMMIT','release']);
  }
});
test('idempotent replay preserves order state and rejects payload conflicts without reserving again',async()=>{
  for(const quantity of [1,2]) {
    const queries=[];
    const order={id:'existing',product_id:productId,quantity:1,lifecycle:'cancelled'};
    const pool={async connect(){return {async query(sql){
      queries.push(sql);
      if(sql.startsWith('SELECT * FROM demo_orders')) return {rowCount:1,rows:[order]};
      if(sql.startsWith('UPDATE')) throw Error('Replay must not reserve stock');
      return {rows:[]};
    },release(){}};}};
    const result=createOrder(pool,req.principal.id,productId,quantity,'valid-demo-key');
    if(quantity===1) assert.equal(await result,order);
    else await assert.rejects(result,e=>e.getStatus()===409);
    assert(queries.includes(quantity===1?'COMMIT':'ROLLBACK'));
  }
});
test('insufficient stock and unsafe prices roll back order creation',async()=>{
  for(const stock of [{rowCount:0,rows:[]},{rowCount:1,rows:[{price_kobo:'9007199254740992'}]}]) {
    const queries=[];
    const pool={async connect(){return {async query(sql){
      queries.push(sql);
      if(sql.includes('FROM demo_orders')) return {rowCount:0,rows:[]};
      if(sql.startsWith('UPDATE products')) return stock;
      if(sql.startsWith('INSERT')) throw Error('Must not insert an order');
      return {rows:[]};
    },release(){}};}};
    await assert.rejects(createOrder(pool,req.principal.id,productId,1,'valid-demo-key'),e=>e.getStatus()===(stock.rowCount?400:409));
    assert(queries.includes('ROLLBACK'));
  }
});
test('expired joins commit inventory release before returning conflict',async()=>{
  const calls=[];
  const campaign={id:productId,product_id:productId,lifecycle:'open',min_members:2,expires_at:new Date(0)};
  const pool={async connect(){return {async query(sql){
    calls.push(sql);
    if(sql.includes('FROM campaigns')) return {rowCount:1,rows:[campaign]};
    if(sql.includes('clock_timestamp()')) return {rows:[{elapsed:true}]};
    if(sql.includes('COUNT(*)')) return {rows:[{n:1}]};
    if(sql.includes('UPDATE campaign_members')) return {rowCount:1,rows:[{id:'member'}]};
    return {rows:[]};
  },release(){calls.push('release');}};}};
  await assert.rejects(new ApiController({pool}).join(productId,{demoAlias:'demo_late'},req),e=>e.getStatus()===409);
  assert(calls.some(x=>x.startsWith('UPDATE products')));
  assert(calls.includes('COMMIT'));
  assert(!calls.includes('ROLLBACK'));
});
test('cart validation rejects forged prices, duplicate items and invalid quantities before storage',async()=>{
  const api=new ApiController({pool:{connect(){throw Error('Unexpected storage access');}}});
  const item={productId,quantity:1};
  for(const input of [
    {items:[item],idempotencyKey:'valid-key',total_kobo:1},
    {items:[item,item],idempotencyKey:'valid-key'},
    {items:[],idempotencyKey:'valid-key'},
    {items:[{...item,quantity:11}],idempotencyKey:'valid-key'},
    {items:[{...item,price:1}],idempotencyKey:'valid-key'},
    {items:[item],idempotencyKey:'short'},
  ]) await assert.rejects(api.cartCheckout(input,req),e=>e.getStatus()===400);
});
test('merchant listing validation rejects invalid input before storage',async()=>{
  const api=new ApiController({pool:{query(){throw Error('Unexpected storage access');}}});
  const valid={name:'Synthetic',category:'Test',description:'Test only',priceKobo:100,stock:1};
  for(const input of [{...valid,merchant_id:'other'},{...valid,priceKobo:0},{...valid,stock:-1},{...valid,name:''},{...valid,stock:1.5}]) {
    await assert.rejects(api.createProduct(input,req),e=>e.getStatus()===400);
  }
  await assert.rejects(api.publishProduct(productId,{published:'true'},req),e=>e.getStatus()===400);
  await assert.rejects(api.fulfill(productId,{lifecycle:'cancelled'},req),e=>e.getStatus()===400);
});
test('processed orders cannot release stock through customer cancellation',async()=>{
  for(const lifecycle of ['processing','shipped','delivered','legacy']){
    const pool={async connect(){return {async query(sql){if(sql.startsWith('SELECT'))return {rowCount:1,rows:[{lifecycle}]};if(sql.startsWith('UPDATE'))throw Error('Must not release stock');return {};},release(){}};}};
    await assert.rejects(new ApiController({pool}).cancelOrder(productId,{},req),e=>e.getStatus()===409);
  }
});
