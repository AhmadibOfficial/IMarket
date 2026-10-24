require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ProtectionController}=require('../dist/protection.controller');
const id='12345678-1234-4234-8234-123456789abc';
const buyer={principal:{id,role:'buyer',merchant_id:null}};
test('fulfillment rejects unknown and inherited lifecycle names before opening a transaction',async()=>{
 const {ApiController}=require('../dist/api.controller');
 const api=new ApiController({pool:{async connect(){assert.fail('Invalid lifecycle must not acquire a database connection');}}});
 for(const lifecycle of ['constructor','toString','__proto__','reserved','cancelled','unknown',null,1]) {
  await assert.rejects(api.fulfill(id,{lifecycle},{principal:{id,role:'merchant',merchant_id:'tenant'}}),e=>e.getStatus()===400);
 }
});
test('order timeline is inaccessible until ownership lookup succeeds',async()=>{
 const calls=[];
 const api=new ProtectionController({pool:{async query(sql,args){calls.push(sql);assert.deepEqual(args,[id,'buyer',id,null]);return {rows:[],rowCount:0};}}});
 await assert.rejects(api.orderDetail(id,buyer),e=>e.getStatus()===400);
 assert.equal(calls.length,1);
});
test('private notification reads scope account and reject forged input and roles',async()=>{
 const calls=[];
 const api=new ProtectionController({pool:{async query(sql,args){calls.push(sql);assert.deepEqual(args,[id,id]);assert.match(sql,/account_id=\$2/);assert.match(sql,/COALESCE/);return {rowCount:0,rows:[]};}}});
 await assert.rejects(api.readNotification(id,{},buyer),e=>e.getStatus()===400);
 assert.equal(calls.length,1);
 await assert.rejects(api.readNotification(id,{account_id:id},buyer),e=>e.getStatus()===400);
 await assert.rejects(api.readNotification('invalid',{},buyer),e=>e.getStatus()===400);
 await assert.rejects(api.notifications({principal:{...buyer.principal,role:'merchant',merchant_id:id}}),e=>e.getStatus()===403);
 assert.equal(calls.length,1);
});
test('web timeline renders escaped audit labels, timestamps and empty state',()=>{
 const ts=require('typescript'),fs=require('node:fs'),Module=require('node:module');
 const filename=require('node:path').resolve(__dirname,'../../web/app/order-intelligence.tsx');
 const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod._compile(compiled,filename);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const html=renderToStaticMarkup(React.createElement(mod.exports.Timeline,{events:[{id,action:'order.<script>',created_at:'2026-10-24T12:00:00Z'}]}));
 assert.match(html,/aria-label="Order timeline"/);assert.match(html,/order.&lt;script&gt;/);assert.match(html,/<time dateTime="2026-10-24T12:00:00Z"/);
 assert.match(renderToStaticMarkup(React.createElement(mod.exports.Timeline,{events:[]})),/No recorded activity/);
});
test('fulfillment delayed retries preserve current state and never duplicate writes',async()=>{
 const {ApiController}=require('../dist/api.controller');
 for(const recorded of [false,true]) {
  const calls=[];
  const client={release(){},async query(sql,args){calls.push(sql);
   if(sql.startsWith('SELECT o.*')) {assert.deepEqual(args,[id,'tenant']);return {rows:[{lifecycle:'delivered'}],rowCount:1};}
   if(sql.startsWith('SELECT id FROM marketplace_audit')) {assert.deepEqual(args,[id,'order.processing']);return {rows:[],rowCount:recorded?1:0};}
   return {rows:[]};
  }};
  const api=new ApiController({pool:{async connect(){return client;}}});
  const work=api.fulfill(id,{lifecycle:'processing'},{principal:{id,role:'merchant',merchant_id:'tenant'}});
  if(recorded)assert.equal((await work).lifecycle,'delivered');
  else await assert.rejects(work,e=>e.getStatus()===409);
  assert(!calls.some(x=>/^(UPDATE|INSERT)/.test(x)));
  assert(calls.includes(recorded?'COMMIT':'ROLLBACK'));
 }
});
test('notification listing derives buyer scope and returns only private activity fields',async()=>{
 const event={id,order_id:id,read_at:null,action:'order.processing',created_at:'2026-10-24T12:00:00Z'};
 const api=new ProtectionController({pool:{async query(sql,args){
  assert.deepEqual(args,[id]);assert.match(sql,/WHERE n.account_id=\$1/);
  assert(!/SELECT\s+\*/i.test(sql));assert(!/actor_id|password|evidence/.test(sql));
  return {rows:[event]};
 }}});
 assert.deepEqual(await api.notifications(buyer),[event]);
});
test('fulfillment transaction rolls back and releases its connection when audit or notification insertion fails',async()=>{
 const {ApiController}=require('../dist/api.controller');
 const calls=[],failure=new Error('Synthetic notification insertion failure');
 const api=new ApiController({pool:{async connect(){return {release(){calls.push('release');},async query(sql){calls.push(sql);
  if(sql.startsWith('SELECT o.*'))return {rows:[{lifecycle:'reserved'}],rowCount:1};
  if(sql.startsWith('INSERT INTO marketplace_audit'))throw failure;
  return {rows:[],rowCount:0};
 }};}}});
 await assert.rejects(api.fulfill(id,{lifecycle:'processing'},{principal:{id,role:'merchant',merchant_id:'tenant'}}),e=>e===failure);
 assert(calls.some(sql=>sql.startsWith('UPDATE demo_orders')));
 assert.deepEqual(calls.slice(-2),['ROLLBACK','release']);assert(!calls.includes('COMMIT'));
});
