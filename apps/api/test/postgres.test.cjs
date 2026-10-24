require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {assertSettledHttp}=require('./settled-http.cjs');
const {AuthService}=require('../dist/auth.service');
const {ApiController}=require('../dist/api.controller');
const {hashPassword,tokenHash}=require('@imarket/commerce-domain/auth.cjs');
test('PostgreSQL migrations, tenant constraint, session expiry and atomic parallel limits', {skip:!process.env.IMARKET_TEST_DATABASE_URL ? 'IMARKET_TEST_DATABASE_URL is unset; isolated local PostgreSQL required' : false},async()=>{
  assert.notEqual(process.env.NODE_ENV,'production');
  const target=new URL(process.env.IMARKET_TEST_DATABASE_URL);
  assert(['localhost','127.0.0.1','[::1]'].includes(target.hostname), 'Test database must use loopback');
  assert(/^\/imarket_test_[a-z0-9_]+$/.test(target.pathname), 'Dedicated imarket_test_* database required');
  assert.equal(target.search, '', 'Connection overrides are forbidden');
  const schema='imk002_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:process.env.IMARKET_TEST_DATABASE_URL,connectionTimeoutMillis:2000});
  let pool, created=false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created=true;
    pool=new Pool({connectionString:process.env.IMARKET_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:12,connectionTimeoutMillis:2000});
    for(let pass=0;pass<2;pass++) for(const file of ['001_init.sql','002_auth.sql','003_inventory.sql','004_shopping.sql','005_protection.sql','006_admin_mfa.sql']) await pool.query(readFileSync(`${__dirname}/../migrations/${file}`,'utf8'));
    const tenants=await pool.query("INSERT INTO merchants(alias) VALUES('demo_tenant_a'),('demo_tenant_b') RETURNING id");
    const [a,b]=tenants.rows.map(x=>x.id);
    const product=(await pool.query('SELECT id FROM products LIMIT 1')).rows[0].id;
    await pool.query("UPDATE merchants SET status='approved'");
    await pool.query("UPDATE products SET merchant_id=$1,moderation='approved' WHERE id=$2",[a,product]);
    const api=new ApiController({pool});
    const visible=(await api.products()).find(p=>p.id===product);
    assert(visible,'Approved merchant product is discoverable');
    assert((await api.products({q:visible.name,category:visible.category,minPriceKobo:String(visible.price_kobo),maxPriceKobo:String(visible.price_kobo)})).some(p=>p.id===product));
    assert.equal((await api.products({q:"%' OR true --"})).length,0,'Search is literal and cannot inject SQL');
    assert.equal((await api.products({category:'nonexistent-category'})).length,0);
    await pool.query("UPDATE merchants SET status='suspended' WHERE id=$1",[a]);
    assert(!(await api.products()).some(p=>p.id===product),'Suspended merchant is not discoverable');
    await pool.query("UPDATE merchants SET status='approved' WHERE id=$1",[a]);

    const input={productId:product,minMembers:2,maxMembers:4,durationHours:1};
    await pool.query('UPDATE products SET published=false WHERE id=$1',[product]);
    await assert.rejects(api.create(input,{principal:{id:randomUUID(),role:'merchant',merchant_id:a}}),e=>e.getStatus()===400);
    await pool.query('UPDATE products SET published=true WHERE id=$1',[product]);

    await assert.rejects(api.create(input,{principal:{id:randomUUID(),role:'merchant',merchant_id:b}}),e=>e.getStatus()===400);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM campaigns')).rows[0].n,0);
    await api.create(input,{principal:{id:randomUUID(),role:'merchant',merchant_id:a}});
    await assert.rejects(pool.query("INSERT INTO campaigns(product_id,min_members,max_members,expires_at,merchant_id) VALUES($1,2,4,now()+interval '1 hour',$2)",[product,b]),e=>e.code==='23503');
    const password='synthetic-test-password';
    const hash=await hashPassword(password);
    const constraint=(sql,params,code)=>assert.rejects(pool.query(sql,params),e=>e.code===code);
    for(const [alias,encoded,role,merchant,code] of [
      ['bad alias',hash,'buyer',null,'23514'],
      ['demo_bad_hash','plaintext','buyer',null,'23514'],
      ['demo_bad_role',hash,'owner',null,'23514'],
      ['demo_no_tenant',hash,'merchant',null,'23514'],
      ['demo_buyer_tenant',hash,'buyer',a,'23514'],
      ['demo_missing_tenant',hash,'merchant',randomUUID(),'23503'],
    ]) await constraint('INSERT INTO accounts(alias,password_hash,role,merchant_id) VALUES($1,$2,$3,$4)',[alias,encoded,role,merchant],code);

    await pool.query("INSERT INTO accounts(alias,password_hash,role) VALUES('synthetic-buyer',$1,'buyer')",[await hashPassword(password)]);
    const auth=new AuthService({pool});
    const login=await auth.login({alias:'synthetic-buyer',password},'loopback');
    const header=`Bearer ${login.accessToken}`;
    const account=(await pool.query("SELECT id FROM accounts WHERE alias='synthetic-buyer'")).rows[0].id;
    const stored=(await pool.query('SELECT token_hash,expires_at FROM sessions WHERE account_id=$1',[account])).rows[0];
    assert.equal(stored.token_hash,tokenHash(login.accessToken));
    assert.notEqual(stored.token_hash,login.accessToken);
    assert(Math.abs(new Date(stored.expires_at).getTime()-Date.now()-900000)<10000);
    await constraint("INSERT INTO accounts(alias,password_hash,role) VALUES('synthetic-buyer',$1,'buyer')",[hash],'23505');
    await constraint("INSERT INTO sessions VALUES('plaintext',$1,now())",[account],'23514');
    await constraint("INSERT INTO sessions VALUES($1,$2,now())",['f'.repeat(64),randomUUID()],'23503');
    await constraint("INSERT INTO sessions VALUES($1,$2,now())",[stored.token_hash,account],'23505');
    await pool.query('UPDATE accounts SET disabled=true WHERE id=$1',[account]);
    await assert.rejects(auth.authenticate(header),e=>e.getStatus()===401);
    await pool.query("UPDATE accounts SET disabled=false,role='admin' WHERE id=$1",[account]);
    await assert.rejects(auth.authenticate(header),e=>e.getStatus()===401);
    await pool.query("UPDATE accounts SET role='buyer' WHERE id=$1",[account]);

    assert.equal((await auth.authenticate(header)).role,'buyer');
    await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
    await assert.rejects(auth.authenticate(header),e=>e.getStatus()===401);
    await auth.logout(header);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n,0);
    await assert.rejects(auth.authenticate(header),e=>e.getStatus()===401);
    const campaign=(await pool.query('SELECT id FROM campaigns LIMIT 1')).rows[0].id;
    const req={principal:{id:account,role:'buyer',merchant_id:null}};
    await api.join(campaign,{demoAlias:'demo_first'},req);
    await assert.rejects(api.join(campaign,{demoAlias:'demo_second'},req),e=>e.getStatus()===409);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM campaign_members')).rows[0].n,1);
    await pool.query("UPDATE campaigns SET expires_at=now()-interval '1 second' WHERE id=$1",[campaign]);
    await assert.rejects(api.join(campaign,{demoAlias:'demo_third'},req),e=>e.getStatus()===409);
    await constraint('UPDATE products SET merchant_id=$1 WHERE id=$2',[b,product],'23503');
    await constraint('INSERT INTO auth_limits VALUES($1,0,now())',['invalid-count'],'23514');
    const other=new AuthService({pool});
    const logins=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?auth:other).login({alias:'demo_unknown',password},`local-${i}`)));
    assertSettledHttp(logins,{401:5,429:5},'parallel alias logins');
    const ipLogins=await Promise.allSettled(Array.from({length:35},(_,i)=>(i%2?auth:other).login({alias:`demo_missing_${i}`,password},'shared-local')));
    assertSettledHttp(ipLogins,{401:30,429:5},'parallel IP logins');
    const results=await Promise.allSettled(Array.from({length:20},()=>auth.limit('parallel-key',5)));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,5);
    assertSettledHttp(results.filter(x=>x.status==='rejected'),{429:15},'parallel limit rejections');
    await pool.query("UPDATE auth_limits SET resets_at=now()-interval '1 second'");
    await auth.limit('parallel-key',5);
    // IMK-003: real PostgreSQL contention through independent controllers/connections.
    const api2=new ApiController({pool});
    await pool.query('UPDATE products SET stock_demo=3 WHERE id=$1',[product]);
    const orderInput={productId:product,quantity:1,idempotencyKey:'same-order-key'};
    const retries=await Promise.all(Array.from({length:16},(_,i)=>(i%2?api:api2).checkout(orderInput,req)));
    assert.equal(new Set(retries.map(x=>x.id)).size,1);
    assert(retries.every(x=>x.paymentCaptured===false && x.fulfilmentCreated===false && x.lifecycle==='reserved'));
    const stock=async()=> (await pool.query('SELECT stock_demo FROM products WHERE id=$1',[product])).rows[0].stock_demo;
    assert.equal(await stock(),2);
    await assert.rejects(api.checkout({...orderInput,quantity:2},req),e=>e.getStatus()===409);
    assert.equal(await stock(),2);
    const orders=await Promise.allSettled(Array.from({length:8},(_,i)=>(i%2?api:api2).checkout({...orderInput,idempotencyKey:`different-key-${i}`},req)));
    assert.equal(orders.filter(x=>x.status==='fulfilled').length,2);
    assertSettledHttp(orders.filter(x=>x.status==='rejected'),{409:6},'inventory exhaustion');
    assert.equal(await stock(),0);
    const otherAccount=(await pool.query("INSERT INTO accounts(alias,password_hash,role) VALUES('demo_other_buyer',$1,'buyer') RETURNING id",[hash])).rows[0].id;
    const otherReq={principal:{id:otherAccount,role:'buyer',merchant_id:null}};
    await assert.rejects(api.cancelOrder(retries[0].id,{},otherReq),e=>e.getStatus()===400);
    await Promise.all(Array.from({length:8},()=>api.cancelOrder(retries[0].id,{},req)));
    assert.equal(await stock(),1);
    assert.equal((await api.checkout(orderInput,req)).lifecycle,'cancelled');
    assert.equal(await stock(),1);
    const independent=await api.checkout(orderInput,otherReq);
    assert.notEqual(independent.id,retries[0].id);
    assert.equal(await stock(),0);
    await api.cancelOrder(independent.id,{},otherReq);
    const merchantReq={principal:{id:randomUUID(),role:'merchant',merchant_id:a}};
    const wrongMerchant={principal:{id:randomUUID(),role:'merchant',merchant_id:b}};
    const makeGroup=async()=> (await api.create(input,merchantReq)).id;
    const group=await makeGroup();
    await assert.rejects(api.expireGroup(group,{},merchantReq),e=>e.getStatus()===409);
    await assert.rejects(api.cancelGroup(group,{},wrongMerchant),e=>e.getStatus()===400);
    // Checkout and a group join compete for the final unit.
    const race=await Promise.allSettled([api.join(group,{demoAlias:'demo_race'},req),api2.checkout({...orderInput,idempotencyKey:'race-checkout'},req)]);
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
    assertSettledHttp(race.filter(x=>x.status==='rejected'),{409:1},'join versus checkout');
    assert.equal(await stock(),0);
    await api.cancelGroup(group,{},merchantReq);
    if(race[1].status==='fulfilled') await api.cancelOrder(race[1].value.id,{},req);
    assert.equal(await stock(),1);
    // Duplicate membership must roll back its stock reservation.
    const failed=await makeGroup();
    await pool.query('UPDATE products SET stock_demo=5 WHERE id=$1',[product]);
    await api.join(failed,{demoAlias:'demo_member'},req);
    await assert.rejects(api.join(failed,{demoAlias:'demo_duplicate'},req),e=>e.getStatus()===409);
    assert.equal(await stock(),4);
    await pool.query("UPDATE campaigns SET expires_at=now()-interval '1 second' WHERE id=$1",[failed]);
    const expirations=await Promise.all(Array.from({length:8},()=>api.expireGroup(failed,{},merchantReq)));
    assert(expirations.every(x=>x.state==='expired'));
    assert.equal(await stock(),5);
    await assert.rejects(api.join(failed,{demoAlias:'demo_closed'},otherReq),e=>e.getStatus()===409);
    const cancelled=await makeGroup();
    await api.join(cancelled,{demoAlias:'demo_cancel'},req);
    await Promise.all(Array.from({length:8},()=>api.cancelGroup(cancelled,{},merchantReq)));
    assert.equal(await stock(),5);
    await assert.rejects(api.join(cancelled,{demoAlias:'demo_closed'},otherReq),e=>e.getStatus()===409);
    const confirmed=await makeGroup();
    await api.join(confirmed,{demoAlias:'demo_confirm_a'},req);
    await api.join(confirmed,{demoAlias:'demo_confirm_b'},otherReq);
    await pool.query("UPDATE campaigns SET expires_at=now()-interval '1 second' WHERE id=$1",[confirmed]);
    assert.equal((await api.expireGroup(confirmed,{},merchantReq)).state,'confirmed');
    await assert.rejects(api.cancelGroup(confirmed,{},merchantReq),e=>e.getStatus()===409);
    assert.equal(await stock(),3);
    const lazy=await makeGroup();
    await api.join(lazy,{demoAlias:'demo_lazy'},req);
    await pool.query("UPDATE campaigns SET expires_at=now()-interval '1 second' WHERE id=$1",[lazy]);
    await assert.rejects(api.join(lazy,{demoAlias:'demo_late'},otherReq),e=>e.getStatus()===409);
    assert.equal((await pool.query('SELECT lifecycle FROM campaigns WHERE id=$1',[lazy])).rows[0].lifecycle,'expired');
    assert.equal(await stock(),3);
    const capacity=await makeGroup();
    await pool.query('UPDATE products SET stock_demo=10 WHERE id=$1',[product]);
    const buyers=[];
    for(let i=0;i<8;i++) {
      const buyer=(await pool.query("INSERT INTO accounts(alias,password_hash,role) VALUES($1,$2,'buyer') RETURNING id",[`demo_capacity_${i}`,hash])).rows[0].id;
      buyers.push({principal:{id:buyer,role:'buyer',merchant_id:null}});
    }
    const joins=await Promise.allSettled(buyers.map((buyer,i)=>(i%2?api:api2).join(capacity,{demoAlias:`demo_capacity_${i}`},buyer)));
    assert.equal(joins.filter(x=>x.status==='fulfilled').length,4);
    assertSettledHttp(joins.filter(x=>x.status==='rejected'),{409:4},'group capacity');
    assert.equal(await stock(),6);
    await api.cancelGroup(capacity,{},merchantReq);
    assert.equal(await stock(),10);
    // Full HTTP journey: real Nest guard, hashed sessions and PostgreSQL transactions.
    const {NestFactory,APP_GUARD}=require('@nestjs/core');
    const {Module}=require('@nestjs/common');
    const {AuthController}=require('../dist/auth.controller');
    const {AuthGuard}=require('../dist/auth.guard');
    const {DbService}=require('../dist/db.service');
    class JourneyModule {}
    Module({controllers:[ApiController,AuthController,require('../dist/protection.controller').ProtectionController],providers:[{provide:DbService,useValue:{pool}},AuthService,{provide:APP_GUARD,useClass:AuthGuard}]})(JourneyModule);
    await pool.query("INSERT INTO accounts(alias,password_hash,role,merchant_id) VALUES('demo_journey_merchant',$1,'merchant',$2),('demo_journey_other',$1,'merchant',$3)",[hash,a,b]);
    const app=await NestFactory.create(JourneyModule,{logger:false});
    try {
      await app.listen(0,'127.0.0.1');
      const base=await app.getUrl();
      async function http(path,body,token,status=200){
        const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const result=await r.json();assert.equal(r.status,status,`Unexpected status for ${path}`);return result;
      }
      const login=async alias=>(await http('/api/auth/login',{alias,password},null,201)).accessToken;
      const seller=await login('demo_journey_merchant'), stranger=await login('demo_journey_other'),buyer=await login('synthetic-buyer'),otherBuyer=await login('demo_other_buyer');
      const listing={name:'Synthetic journey product',category:'Test',description:'Synthetic only',priceKobo:12345,stock:2};
      await http('/api/merchant/products',listing,null,401);
      await http('/api/merchant/products',listing,buyer,403);
      await http('/api/merchant/products',{...listing,priceKobo:-1},seller,400);
      const draft=await http('/api/merchant/products',listing,seller,201);
      assert(!(await http('/api/products')).some(x=>x.id===draft.id));
      await http('/api/merchant/products/'+draft.id+'/publish',{published:true},stranger,400);
      await http('/api/merchant/products/'+draft.id+'/publish',{published:true},seller,400);
      // Local administrator enrollment: encrypted seed, real MFA login, no privileged session injection.
      const {ProtectionController}=require('../dist/protection.controller');
      const protection=new ProtectionController({pool});
      const adminId=(await pool.query("INSERT INTO accounts(alias,password_hash,role) VALUES('demo_review_admin',$1,'admin') RETURNING id",[hash])).rows[0].id;
      const adminReq={principal:{id:adminId,role:'admin',merchant_id:null}};
      const {encryptSeed,totp}=require('../dist/admin-mfa');
      const previousMfaKey=process.env.IMARKET_MFA_KEY;
      process.env.IMARKET_MFA_KEY='d'.repeat(64);
      let adminToken;
      try {
        const seed='3132333435363738393031323334353637383930';
        await pool.query('INSERT INTO admin_mfa(account_id,encrypted_seed) VALUES($1,$2)',[adminId,encryptSeed(seed,adminId)]);
        await http('/api/auth/login',{alias:'demo_review_admin',password},null,401);
        await http('/api/auth/login',{alias:'demo_review_admin',password,otp:totp(seed,0)},null,401);
        const code=totp(seed,Math.floor(Date.now()/30000));
        const results=await Promise.all(Array.from({length:2},async()=>{
          const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({alias:'demo_review_admin',password,otp:code})});
          return {status:r.status,body:await r.json()};
        }));
        assert.deepEqual(results.map(r=>r.status).sort(),[201,401]);
        adminToken=results.find(r=>r.status===201).body.accessToken;
        await http('/api/auth/login',{alias:'demo_review_admin',password,otp:code},null,401);
        await http('/api/admin/reviews',undefined,seller,403);
        await http('/api/admin/reviews',undefined,buyer,403);
        assert((await http('/api/admin/reviews',undefined,adminToken)).merchants.some(m=>m.id===a));
        await http(`/api/admin/merchants/${a}/review`,{status:'approved'},adminToken,201);
      } finally {
        if(previousMfaKey===undefined)delete process.env.IMARKET_MFA_KEY;else process.env.IMARKET_MFA_KEY=previousMfaKey;
      }

      await assert.rejects(protection.reviewProduct(draft.id,{decision:'publish'},req),e=>e.getStatus()===403);
      await http(`/api/admin/products/${draft.id}/review`,{decision:'publish'},adminToken,201);
      await http(`/api/merchant/products/${draft.id}/edit`,{name:'Unauthorized edit',description:'Synthetic only'},stranger,400);
      await http(`/api/merchant/products/${draft.id}/edit`,{name:'Synthetic revised product',description:'Synthetic revised description'},seller,201);
      assert(!(await http('/api/products')).some(x=>x.id===draft.id));
      await http(`/api/admin/products/${draft.id}/review`,{decision:'publish'},adminToken,201);
      assert.equal((await http('/api/merchant/overview',undefined,seller)).products>=1,true);
      // A failing audit insert must roll back content and publication atomically.
      await pool.query("ALTER TABLE marketplace_audit ADD CONSTRAINT synthetic_audit_failure CHECK(action<>'product.edit') NOT VALID");
      const sellerAccount=(await pool.query("SELECT id FROM accounts WHERE alias='demo_journey_merchant'")).rows[0].id;
      await assert.rejects(protection.edit(draft.id,{name:'Must roll back',description:'Synthetic rollback'}, {principal:{id:sellerAccount,role:'merchant',merchant_id:a}}),e=>e.code==='23514');
      const unchanged=(await pool.query('SELECT name,published FROM products WHERE id=$1',[draft.id])).rows[0];
      assert.equal(unchanged.name,'Synthetic revised product');assert.equal(unchanged.published,true);
      await pool.query('ALTER TABLE marketplace_audit DROP CONSTRAINT synthetic_audit_failure');

      assert((await http('/api/products')).some(x=>x.id===draft.id));
      const cart={items:[{productId:draft.id,quantity:1}],idempotencyKey:'journey-cart-key'};
      await http('/api/cart-checkout',{...cart,total_kobo:1},buyer,400);
      const responses=await Promise.all(Array.from({length:5},()=>http('/api/cart-checkout',cart,buyer,201)));
      const oid=responses[0].orderIds[0];assert(responses.every(x=>x.orderIds[0]===oid));
      await http('/api/cart-checkout',{...cart,items:[{productId:draft.id,quantity:2}]},buyer,409);
      const owned=(await http('/api/orders',undefined,buyer)).find(x=>x.id===oid);
      assert.equal(Number(owned.total_kobo),12345);assert.equal(owned.lifecycle,'reserved');
      assert(!(await http('/api/orders',undefined,otherBuyer)).some(x=>x.id===oid));
      assert(!(await http('/api/orders',undefined,stranger)).some(x=>x.id===oid));
      await http('/api/demo-orders/'+oid+'/cancel',{},otherBuyer,400);
      await http('/api/merchant/orders/'+oid+'/fulfill',{lifecycle:'processing'},stranger,400);
      await http('/api/merchant/orders/'+oid+'/fulfill',{lifecycle:'shipped'},seller,409);
      for(const lifecycle of ['processing','shipped','delivered']) await http('/api/merchant/orders/'+oid+'/fulfill',{lifecycle},seller,201);
      await http('/api/demo-orders/'+oid+'/cancel',{},buyer,409);
      assert.equal((await http('/api/orders',undefined,buyer)).find(x=>x.id===oid).lifecycle,'delivered');
      const cancellable=await http('/api/cart-checkout',{...cart,idempotencyKey:'journey-cancel-key'},buyer,201);
      await Promise.all(Array.from({length:4},()=>http('/api/demo-orders/'+cancellable.orderIds[0]+'/cancel',{},buyer,201)));
      assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[draft.id])).rows[0].stock_demo,1);
      // Later cart failure rolls back all earlier reservations and orders.
      const missing='ffffffff-ffff-4fff-8fff-ffffffffffff';
      await http('/api/cart-checkout',{items:[{productId:draft.id,quantity:1},{productId:missing,quantity:1}],idempotencyKey:'journey-rollback'},buyer,409);
      assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[draft.id])).rows[0].stock_demo,1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM demo_orders WHERE product_id=$1',[draft.id])).rows[0].n,2);
      const {ProtectionController:Protection}=require('../dist/protection.controller');
      const protectionApi=new Protection({pool});
      await assert.rejects(protectionApi.open({orderId:oid,reason:'Missing item',evidence:'Synthetic note',refundRequested:true},otherReq),e=>e.getStatus()===400);
      await http('/api/disputes',{orderId:oid,reason:'Missing item',evidence:'Synthetic note',refundRequested:true},otherBuyer,400);
      await http(`/api/orders/${oid}`,undefined,stranger,400);
      const disputeInput={orderId:oid,reason:'Missing item',evidence:'Synthetic note',refundRequested:true};
      const attempts=await Promise.allSettled(Array.from({length:5},()=>protectionApi.open(disputeInput,req)));
      assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
      assertSettledHttp(attempts.filter(x=>x.status==='rejected'),{409:4},'duplicate disputes');
      const dispute=attempts.find(x=>x.status==='fulfilled').value;
      assert.equal((await protectionApi.disputes(otherReq)).length,0);
      await assert.rejects(protectionApi.respond(dispute.id,{response:'Synthetic response'},wrongMerchant),e=>e.getStatus()===400);
      const sellerId=(await pool.query("SELECT id FROM accounts WHERE alias='demo_journey_merchant'")).rows[0].id;
      await protectionApi.respond(dispute.id,{response:'Synthetic response'},{principal:{id:sellerId,role:'merchant',merchant_id:a}});
      await http(`/api/disputes/${dispute.id}/resolve`,{status:'resolved',resolution:'Record only; no money movement'},seller,403);
      await http(`/api/disputes/${dispute.id}/resolve`,{status:'resolved',resolution:'Record only; no money movement'},adminToken,201);
      await assert.rejects(protectionApi.resolve(dispute.id,{status:'rejected',resolution:'Duplicate decision'},adminReq),e=>e.getStatus()===409);
      assert((await protectionApi.audits(adminReq)).some(x=>x.action==='dispute.resolved'));
      // Social journey exercises the real guard, tenant scope and owned protection endpoints.
      const groupInput={productId:draft.id,minMembers:2,maxMembers:4,durationHours:1};
      await http('/api/groups',groupInput,null,401);
      await http('/api/groups',groupInput,buyer,403);
      await http('/api/groups',groupInput,stranger,400);
      await http('/api/groups',{...groupInput,groupPriceKobo:1},seller,400);
      await http('/api/groups',{...groupInput,minMembers:0},seller,400);
      await pool.query('UPDATE products SET stock_demo=3,group_price_kobo=10000 WHERE id=$1',[draft.id]);
      const socialGroup=await http('/api/groups',groupInput,seller,201);
      const groupPath='/api/groups/'+socialGroup.id;
      await http(groupPath+'/join',{demoAlias:'demo_social_http'},null,401);
      await http(groupPath+'/join',{demoAlias:'demo_social_http'},seller,403);
      await http(groupPath+'/join',{demoAlias:'bad alias'},buyer,400);
      const duplicates=await Promise.all(Array.from({length:6},async()=>{
        const r=await fetch(base+groupPath+'/join',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+buyer},body:JSON.stringify({demoAlias:'demo_social_http'})});
        return r.status;
      }));
      assert.deepEqual(duplicates.sort(),[201,409,409,409,409,409]);
      assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[draft.id])).rows[0].stock_demo,2);
      await http(groupPath+'/checkout',{},null,401);
      await http(groupPath+'/checkout',{},seller,403);
      await http(groupPath+'/checkout',{},otherBuyer,409);
      await http(groupPath+'/checkout',{totalKobo:1},buyer,400);
      assert.equal((await http(groupPath+'/checkout',{},buyer,201)).orderCreated,false);
      await http(groupPath+'/join',{demoAlias:'demo_social_other'},otherBuyer,201);
      await pool.query("UPDATE campaigns SET expires_at=now()-interval '1 second' WHERE id=$1",[socialGroup.id]);
      await http(groupPath+'/join',{demoAlias:'demo_late_http'},buyer,409);
      const socialOrders=await Promise.all(Array.from({length:6},()=>http(groupPath+'/checkout',{},buyer,201)));
      const socialId=socialOrders[0].id;
      assert(socialId);assert(socialOrders.every(o=>o.id===socialId&&Number(o.total_kobo)===10000&&o.paymentCaptured===false));
      const secondOrder=await http(groupPath+'/checkout',{},otherBuyer,201);
      assert.notEqual(secondOrder.id,socialId);
      assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[draft.id])).rows[0].stock_demo,1);
      await http('/api/orders/'+socialId,undefined,otherBuyer,400);
      await http('/api/orders/'+socialId,undefined,stranger,400);
      assert(!(await http('/api/orders',undefined,otherBuyer)).some(o=>o.id===socialId));
      await http('/api/demo-orders/'+socialId+'/cancel',{},otherBuyer,400);
      const groupDispute={orderId:socialId,reason:'Synthetic group dispute',evidence:'Synthetic evidence only',refundRequested:true};
      await http('/api/disputes',groupDispute,otherBuyer,400);
      await http('/api/disputes',groupDispute,buyer,201);
      assert((await http('/api/disputes',undefined,buyer)).some(d=>d.order_id===socialId));
      await Promise.all(Array.from({length:4},()=>http('/api/demo-orders/'+socialId+'/cancel',{},buyer,201)));
      assert.equal((await http(groupPath+'/checkout',{},buyer,201)).lifecycle,'cancelled');
      assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[draft.id])).rows[0].stock_demo,2);
      await protectionApi.reviewMerchant(a,{status:'suspended'},adminReq);
      assert(!(await http('/api/products')).some(x=>x.id===draft.id));
      await http('/api/cart-checkout',{items:[{productId:draft.id,quantity:1}],idempotencyKey:'suspended-checkout'},buyer,409);
      await pool.query("UPDATE sessions SET mfa_verified_at=now()-interval '6 minutes' WHERE token_hash=$1",[tokenHash(adminToken)]);
      await http('/api/admin/reviews',undefined,adminToken,401);
      await http('/api/auth/logout',{},buyer,201);
      await http('/api/orders',undefined,buyer,401);
    } finally {await app.close();}
    // IMK-008: confirmed membership transfers exactly one held item into an owned order.
    await pool.query("UPDATE merchants SET status='approved' WHERE id=$1",[a]);
    await pool.query("UPDATE products SET published=true,moderation='approved',stock_demo=10 WHERE id=$1",[product]);
    const social=await api.create(input,{principal:{id:account,role:'merchant',merchant_id:a}});
    await api.join(social.id,{demoAlias:'demo_social_one'},req);
    await api.join(social.id,{demoAlias:'demo_social_two'},otherReq);
    assert.equal((await api.groupCheckout(social.id,{},req)).orderCreated,false);
    await assert.rejects(api.groupCheckout(social.id,{totalKobo:1},req),e=>e.getStatus()===400);
    await assert.rejects(api.checkout({productId:product,quantity:1,idempotencyKey:'group_'+social.id},req),e=>e.getStatus()===400);
    await assert.rejects(api.groupCheckout(social.id,{}, {principal:{id:randomUUID()}}),e=>e.getStatus()===409);
    await pool.query("UPDATE campaigns SET expires_at=now()-interval '1 second' WHERE id=$1",[social.id]);
    const held=(await pool.query('SELECT stock_demo,group_price_kobo FROM products WHERE id=$1',[product])).rows[0];
    const groupOrders=await Promise.all(Array.from({length:8},()=>api.groupCheckout(social.id,{},req)));
    assert.equal(new Set(groupOrders.map(o=>o.id)).size,1);
    assert.equal(Number(groupOrders[0].total_kobo),Number(held.group_price_kobo));
    assert.equal(groupOrders[0].paymentCaptured,false);
    assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[product])).rows[0].stock_demo,held.stock_demo);
    await api.cancelOrder(groupOrders[0].id,{},req);
    assert.equal((await api.groupCheckout(social.id,{},req)).lifecycle,'cancelled');
    assert.equal((await pool.query('SELECT stock_demo FROM products WHERE id=$1',[product])).rows[0].stock_demo,held.stock_demo+1);
    await constraint('UPDATE products SET stock_demo=-1 WHERE id=$1',[product],'23514');
  } finally {
    if(pool) await pool.end();
    if(created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
