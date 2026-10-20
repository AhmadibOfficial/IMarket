require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ProtectionController,text,identifier}=require('../dist/protection.controller');
test('protection validation rejects attachments, control characters and oversized evidence',()=>{
 for(const value of [{url:'https://example.invalid'},[],null,'x','bad\0text','x'.repeat(4001)]) assert.throws(()=>text(value,4000),e=>e.getStatus()===400);
 assert.equal(text(' Synthetic evidence '),'Synthetic evidence');
 for(const id of ['no-id',null,{},'../../etc/passwd']) assert.throws(()=>identifier(id),e=>e.getStatus()===400);
});
test('review and response methods deny wrong roles before database access',async()=>{
 const api=new ProtectionController({pool:{query(){throw Error('Unexpected database access');}}});
 const buyer={principal:{id:'buyer',role:'buyer',merchant_id:null}};
 for(const work of [()=>api.reviewMerchant('bad',{},buyer),()=>api.reviewProduct('bad',{},buyer),()=>api.respond('bad',{},buyer),()=>api.resolve('bad',{},buyer),()=>api.audits(buyer),()=>api.reviews(buyer),()=>api.application(buyer)]) await assert.rejects(work,e=>e.getStatus()===403);
});

test('protection routes reject forged ownership, unsupported evidence and missing merchant tenancy',async()=>{
 const api=new ProtectionController({pool:{query(){throw Error('Unexpected database access');},connect(){throw Error('Unexpected database access');}}});
 const merchant={principal:{id:'merchant',role:'merchant',merchant_id:'tenant'}};
 const buyer={principal:{id:'buyer',role:'buyer',merchant_id:null}};
 const id='12345678-1234-4234-8234-123456789abc';
 for(const body of [{name:'Valid name',description:'Description',merchant_id:'victim'},{name:'x',description:'Description'},{name:'Valid name',description:{file:'data'}}]) await assert.rejects(api.edit(id,body,merchant),e=>e.getStatus()===400);
 for(const body of [{orderId:id,reason:'Missing',evidence:{url:'file:///etc/passwd'},refundRequested:true},{orderId:id,reason:'Missing',evidence:'Text only',refundRequested:'true'},{orderId:id,reason:'Missing',evidence:'Text only',refundRequested:true,attachments:[]}]) await assert.rejects(api.open(body,buyer),e=>e.getStatus()===400);
 await assert.rejects(api.overview({principal:{...merchant.principal,merchant_id:null}}),e=>e.getStatus()===403);
});
test('product editing withdraws listing, scopes tenant and rolls back on audit failure',async()=>{
 const id='12345678-1234-4234-8234-123456789abc';
 for(const found of [false,true])for(const auditFails of [false,true]) {
 const calls=[];const failure=new Error('Synthetic audit unavailable');
 const pool={async connect(){return {release(){calls.push('release');},async query(sql,params){calls.push(sql);
 if(sql.startsWith('UPDATE products')) {assert(sql.includes("published=false,moderation='pending'"));assert.equal(params[1],'tenant');return {rowCount:found?1:0,rows:[{id}]};}
 if(sql.includes('marketplace_audit')&&auditFails)throw failure;
 return {rows:[]};}};}};
 const result=new ProtectionController({pool}).edit(id,{name:'Synthetic name',description:'Synthetic description'},{principal:{id:'actor',role:'merchant',merchant_id:'tenant'}});
 if(!found)await assert.rejects(result,e=>e.getStatus()===400);
 else if(auditFails)await assert.rejects(result,e=>e===failure);
 else assert.equal((await result).id,id);
 assert(calls.includes(found&&!auditFails?'COMMIT':'ROLLBACK'));
 }
});
