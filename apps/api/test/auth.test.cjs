require('reflect-metadata');
const {test}=require('node:test');
const {assertSettledHttp}=require('./settled-http.cjs');
const assert=require('node:assert/strict');
const {AuthService,objectInput}=require('../dist/auth.service');
const {AuthGuard}=require('../dist/auth.guard');
const {ApiController}=require('../dist/api.controller');
const {hashPassword,tokenHash}=require('@imarket/commerce-domain/auth.cjs');
const productId='12345678-1234-4234-8234-123456789abc';
const principal={id:'buyer-id',role:'buyer',merchant_id:null};
const rejectsStatus=(promise,status)=>assert.rejects(promise,e=>e.getStatus()===status);
function store(account, clock=()=>Date.now()) {
  const sessions=new Map(), limits=new Map();
  return {sessions,limits, pool:{async query(sql,params){
    if(sql.includes('INSERT INTO auth_limits')) {const n=(limits.get(params[0])??0)+1;limits.set(params[0],n);return {rows:[{attempts:n}]};}
    if(sql.includes('password_hash')) return {rows:account && params[0]==='synthetic-buyer'?[account]:[]};
    if(sql.includes('INSERT INTO sessions')) {sessions.set(params[0],{...account,expires:clock()+900000});return {rows:[]};}
    if(sql.includes('JOIN accounts')) {const a=sessions.get(params[0]);return {rows:a && a.expires>clock() && !a.disabled?[a]:[]};}
    if(sql.includes('DELETE FROM sessions')) {sessions.delete(params[0]);return {rows:[]};}
    throw Error('Unexpected query');
  }}};
}
test('login issues opaque hashed sessions; logout, expiry, disabled accounts and restart are enforced',async()=>{
  let now=0;
  const account={...principal,password_hash:await hashPassword('synthetic-test-password'),disabled:false};
  const db=store(account,()=>now);
  const auth=new AuthService(db);
  const input={alias:'synthetic-buyer',password:'synthetic-test-password'};
  const session=await auth.login(input,'loopback');
  assert.equal(session.expiresIn,900);
  assert.match(session.accessToken,/^[a-f0-9]{64}$/);
  assert(db.sessions.has(tokenHash(session.accessToken)));
  assert(!db.sessions.has(session.accessToken));
  const header=`Bearer ${session.accessToken}`;
  assert.equal((await new AuthService(db).authenticate(header)).id,account.id);
  now=900000;
  await rejectsStatus(auth.authenticate(header),401);
  now=0;
  db.sessions.get(tokenHash(session.accessToken)).disabled=true;
  await rejectsStatus(auth.authenticate(header),401);
  await auth.logout(header);
  await rejectsStatus(auth.authenticate(header),401);
  for(const value of [null,'Bearer bad','Basic abc',header+' ']) await rejectsStatus(auth.authenticate(value),401);
});
test('bad credentials, unknown accounts, disabled users and administrators cannot login',async()=>{
  const hash=await hashPassword('synthetic-test-password');
  for(const account of [null,{...principal,password_hash:hash,disabled:true},{...principal,role:'admin',password_hash:hash}]) {
    await rejectsStatus(new AuthService(store(account)).login({alias:'synthetic-buyer',password:'synthetic-test-password'},'local'),401);
  }
  const auth=new AuthService(store({...principal,password_hash:hash}));
  await rejectsStatus(auth.login({alias:'synthetic-buyer',password:'wrong-long-password'},'local'),401);
  await rejectsStatus(auth.login({alias:'synthetic-buyer',password:'short'},'local'),400);
  await rejectsStatus(auth.login({alias:'synthetic-buyer',password:'synthetic-test-password',role:'admin'},'local'),400);
});
test('parallel login attempts share an account limit across service instances',async()=>{
  const db=store(null);
  const a=new AuthService(db), b=new AuthService(db);
  const results=await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?a:b).login({alias:'synthetic-buyer',password:'synthetic-test-password'},`ip-${i}`)));
  assertSettledHttp(results,{401:5,429:5},'parallel alias logins');
});
function context(controller,handler,request) {
  return {getClass:()=>({name:controller}),getHandler:()=>({name:handler}),switchToHttp:()=>({getRequest:()=>request})};
}
test('global guard denies anonymous writes, wrong roles and unknown handlers',async()=>{
  const auth=new AuthService(store(null));
  const guard=new AuthGuard(auth);
  for(const handler of ['create','join','checkout']) await rejectsStatus(guard.canActivate(context('ApiController',handler,{method:'POST',headers:{}})),401);
  auth.authenticate=async()=>principal;
  await rejectsStatus(guard.canActivate(context('ApiController','create',{method:'POST',headers:{}})),403);
  await rejectsStatus(guard.canActivate(context('ApiController','futureWrite',{method:'POST',headers:{}})),403);
  assert(await guard.canActivate(context('ApiController','join',{method:'POST',headers:{}})));
  assert(await guard.canActivate(context('ApiController','checkout',{method:'POST',headers:{}})));
  auth.authenticate=async()=>({...principal,role:'merchant',merchant_id:'tenant-a'});
  for(const handler of ['join','checkout']) await rejectsStatus(guard.canActivate(context('ApiController',handler,{method:'POST',headers:{}})),403);
  assert(await guard.canActivate(context('ApiController','create',{method:'POST',headers:{}})));
  assert(await guard.canActivate(context('ApiController','health',{method:'GET',headers:{}})));
  assert(await guard.canActivate(context('AuthController','login',{method:'POST',headers:{}})));
});
test('merchant cannot create campaign for another tenant or supply ownership fields',async()=>{
  const writes=[];
  const db={pool:{async query(sql,params){
    if(sql.startsWith('SELECT id FROM products')) {
      assert(sql.includes('merchant_id=$2'));
      return {rowCount:params[1]==='tenant-a'?1:0,rows:[]};
    }
    writes.push(params);
    return {rows:[{id:'new-campaign'}]};
  }}};
  const api=new ApiController(db);
  const input={productId,minMembers:2,maxMembers:5,durationHours:24};
  const req=tenant=>({principal:{id:'merchant-id',role:'merchant',merchant_id:tenant}});
  await rejectsStatus(api.create(input,req('tenant-b')),400);
  assert.equal(writes.length,0);
  await rejectsStatus(api.create({...input,merchant_id:'tenant-a'},req('tenant-b')),400);
  await api.create(input,req('tenant-a'));
  assert.equal(writes.length,1);
  assert.equal(writes[0][4],'tenant-a');
});
test('server rejects invalid shapes and mutable input before any database writes',async()=>{
  const api=new ApiController({pool:{query(){throw Error('Unexpected database access');},connect(){throw Error('Unexpected database access');}}});
  for(const body of [null,[],{role:'admin'}]) assert.throws(()=>objectInput(body,['alias']),e=>e.getStatus()===400);
  for(const body of [null,[],{productId:'bad',quantity:1},{productId,quantity:'1'},{productId,quantity:1,account_id:'victim'}]) await rejectsStatus(api.checkout(body,{principal}),400);
  for(const body of [null,[],{demoAlias:'bad alias'},{demoAlias:'valid',account_id:'victim'}]) await rejectsStatus(api.join(productId,body,{principal}),400);
  for(const body of [{productId,minMembers:1,maxMembers:2,durationHours:1},{productId,minMembers:2,maxMembers:1,durationHours:1},{productId,minMembers:2,maxMembers:3,durationHours:169}]) await rejectsStatus(api.create(body,{principal}),400);
});
test('buyer writes derive ownership from authenticated account and duplicate joins roll back',async()=>{
  const calls=[];
  let duplicate=false;
  const db={pool:{async query(sql,params){
    calls.push([sql,params]);
    if(sql.includes('SELECT price_kobo')) return {rowCount:1,rows:[{price_kobo:100}]};
    if(sql.includes('INSERT INTO demo_orders')) return {rows:[{id:'order'}]};
    throw Error('Unexpected query');
  },async connect(){return {release(){calls.push(['release']);},async query(sql,params){
    calls.push([sql,params]);
    if(sql.includes('FOR UPDATE')) return {rowCount:1,rows:[{id:productId,min_members:2,max_members:5,expires_at:new Date(Date.now()+60000)}]};
    if(sql.includes('COUNT(*)')) return {rows:[{n:0}]};
    if(sql.includes('INSERT INTO campaign_members') && duplicate) throw Object.assign(Error('duplicate'),{code:'23505'});
    return {rows:[]};
  }}}}};
  const api=new ApiController(db);
  const result=await api.checkout({productId,quantity:2},{principal});
  assert.equal(result.paymentCaptured,false);
  assert.equal(calls.find(([sql])=>sql.includes('INSERT INTO demo_orders'))[1][3],principal.id);
  await api.join(productId,{demoAlias:'synthetic-alias'},{principal});
  assert.equal(calls.find(([sql])=>sql.includes('INSERT INTO campaign_members'))[1][3],principal.id);
  duplicate=true;
  await rejectsStatus(api.join(productId,{demoAlias:'other-alias'},{principal}),409);
  assert(calls.some(([sql])=>sql==='ROLLBACK'));
  assert.equal(calls.filter(([sql])=>sql==='release').length,2);
});
test('login rejects malformed and oversized inputs without credential or session queries',async()=>{
  const auth=new AuthService({pool:{async query(sql){
    assert(sql.includes('INSERT INTO auth_limits'));
    return {rows:[{attempts:1}]};
  }}});
  for(const body of [null,[],{}, {alias:123,password:'synthetic-test-password'},
    {alias:'bad alias',password:'synthetic-test-password'},
    {alias:'a'.repeat(33),password:'synthetic-test-password'},
    {alias:'demo_test',password:123}, {alias:'demo_test',password:'é'.repeat(129)},
    {alias:'demo_test',password:'synthetic-test-password',merchant_id:'victim'}]) {
    await rejectsStatus(auth.login(body,'local'),400);
  }
});
test('storage failures deny login and guarded mutations; missing merchant tenancy is forbidden',async()=>{
  const failure=new Error('synthetic storage failure');
  const auth=new AuthService({pool:{async query(){throw failure;}}});
  await assert.rejects(auth.login({alias:'demo_test',password:'synthetic-test-password'},'local'),e=>e===failure);
  auth.authenticate=async()=>principal;
  await assert.rejects(new AuthGuard(auth).canActivate(context('ApiController','checkout',{method:'POST',headers:{}})),e=>e===failure);
  assert.throws(()=>auth.requireRole({...principal,role:'merchant'},'merchant'),e=>e.getStatus()===403);
});
test('guard applies mutation quota, protects logout and denies unknown controllers and public handler names on writes',async()=>{
  let calls=0;
  const auth={async authenticate(){return principal;},requireRole(){},async limit(key,max){
    assert.equal(key,`mutation:${principal.id}`);assert.equal(max,120);calls++;
    if(calls>1) throw Object.assign(new Error('quota'),{getStatus:()=>429});
  }};
  const guard=new AuthGuard(auth);
  assert(await guard.canActivate(context('AuthController','logout',{method:'POST',headers:{}})));
  await rejectsStatus(guard.canActivate(context('ApiController','join',{method:'POST',headers:{}})),429);
  for(const [controller,handler,method] of [['OtherController','login','POST'],['ApiController','health','POST'],['OtherController','products','GET']]) {
    await rejectsStatus(guard.canActivate(context(controller,handler,{method,headers:{}})),403);
  }
  const anonymous=new AuthGuard(new AuthService(store(null)));
  await rejectsStatus(anonymous.canActivate(context('AuthController','logout',{method:'POST',headers:{}})),401);
});
test('invalid UUIDs and noninteger campaign values never reach storage',async()=>{
  const api=new ApiController({pool:{query(){throw Error('Unexpected database access');},connect(){throw Error('Unexpected database access');}}});
  for(const id of ['bad',null,123,productId+"' OR 1=1"]) await rejectsStatus(api.join(id,{demoAlias:'demo_test'},{principal}),400);
  for(const field of ['minMembers','maxMembers','durationHours']) for(const value of ['2',null,NaN,Infinity,2.5,Number.MAX_SAFE_INTEGER+1]) {
    await rejectsStatus(api.create({...{productId,minMembers:2,maxMembers:5,durationHours:1},[field]:value},{principal}),400);
  }
});

test('concurrent assertions preserve database, connection and programming failures',()=>{
  const {HttpException}=require('@nestjs/common');
  const failures=[Object.assign(new Error('synthetic database failure'),{code:'42P01'}),
    Object.assign(new Error('synthetic connection failure'),{code:'ECONNREFUSED'}),
    new TypeError('synthetic programming failure'), {getStatus:()=>401}, null];
  const rejected=reason=>({status:'rejected',reason});
  assertSettledHttp([rejected(new HttpException('credentials',401)),rejected(new HttpException('quota',429))],{401:1,429:1},'expected');
  assert.throws(()=>assertSettledHttp(failures.map(rejected),{401:5},'failures'),error=>{
    assert(error instanceof AggregateError);
    assert.equal(error.errors.length,failures.length);
    error.errors.forEach((entry,i)=>assert.equal(entry.cause,failures[i]));
    return true;
  });
  assert.throws(()=>assertSettledHttp([{status:'fulfilled',value:undefined}],{401:1},'fulfilled'),AggregateError);
  assert.throws(()=>assertSettledHttp([rejected(new HttpException('server',500))],{401:1},'status'),AggregateError);
  assert.throws(()=>assertSettledHttp([rejected(new HttpException('credentials',401))],{401:2},'count'),assert.AssertionError);
});
test('concurrent login preserves raw storage and programming errors without HTTP conversion',async()=>{
  for(const failure of [Object.assign(new Error('synthetic database failure'),{code:'42P01'}),
    Object.assign(new Error('synthetic connection failure'),{code:'ECONNREFUSED'}),new TypeError('synthetic programming failure')]) {
    const auth=new AuthService({pool:{async query(){throw failure;}}});
    const results=await Promise.allSettled(Array.from({length:3},()=>auth.login({alias:'demo_test',password:'synthetic-test-password'},'local')));
    for(const result of results) {
      assert.equal(result.status,'rejected');
      assert.equal(result.reason,failure);
    }
  }
});
