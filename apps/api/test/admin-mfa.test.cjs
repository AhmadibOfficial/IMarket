require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {encryptSeed,decryptSeed,totp,verifyTotp}=require('../dist/admin-mfa');
const {AuthService}=require('../dist/auth.service');
const seed='3132333435363738393031323334353637383930';
test('TOTP known vectors, bounded drift, malformed codes and replay rejection',()=>{
 assert.equal(totp(seed,1),'287082');
 assert.equal(verifyTotp(seed,'287082',-1,59000),1);
 assert.equal(verifyTotp(seed,'287082',1,59000),null);
 assert.equal(verifyTotp(seed,'287082',-1,120000),null);
 for(const value of [null,123456,'12345','1234567',{},'abcdef']) assert.equal(verifyTotp(seed,value,-1,59000),null);
});
test('MFA seed encryption binds to account and fails closed on key loss, rotation and tampering',()=>{
 const previous=process.env.IMARKET_MFA_KEY;
 try {
 process.env.IMARKET_MFA_KEY='a'.repeat(64);
 const value=encryptSeed(seed,'synthetic-account');
 assert(!value.includes(seed));assert.equal(decryptSeed(value,'synthetic-account'),seed);
 assert.throws(()=>decryptSeed(value,'another-account'));
 assert.throws(()=>decryptSeed(value.slice(0,-1)+(value.endsWith('0')?'1':'0'),'synthetic-account'));
 process.env.IMARKET_MFA_KEY='b'.repeat(64);assert.throws(()=>decryptSeed(value,'synthetic-account'));
 delete process.env.IMARKET_MFA_KEY;assert.throws(()=>decryptSeed(value,'synthetic-account'));
 } finally {if(previous===undefined)delete process.env.IMARKET_MFA_KEY;else process.env.IMARKET_MFA_KEY=previous;}
});
test('administrator MFA consumption, session creation and audit share one transaction',async()=>{
 const previous=process.env.IMARKET_MFA_KEY;
 try {
 process.env.IMARKET_MFA_KEY='c'.repeat(64);
 for(const failAudit of [false,true]) {
 const calls=[];const failure=new Error('Synthetic audit storage failure');
 const pool={async connect(){return {release(){calls.push('release');},async query(sql,params){calls.push(sql);
 if(sql.startsWith('SELECT encrypted_seed'))return {rows:[{encrypted_seed:encryptSeed(seed,'admin'),last_step:-1}]};
 if(sql.includes('marketplace_audit')&&failAudit)throw failure;
 if(sql.includes('INSERT INTO sessions'))assert(sql.includes("interval '5 minutes'"));
 return {rows:[]};}};}};
 const auth=new AuthService({pool});
 const result=auth.adminLogin('admin',totp(seed,Math.floor(Date.now()/30000)));
 if(failAudit)await assert.rejects(result,e=>e===failure);else assert.equal((await result).expiresIn,300);
 assert(calls.some(q=>q.includes('FOR UPDATE')));
 assert(calls.includes(failAudit?'ROLLBACK':'COMMIT'));assert.equal(calls.at(-1),'release');
 }
 } finally {if(previous===undefined)delete process.env.IMARKET_MFA_KEY;else process.env.IMARKET_MFA_KEY=previous;}
});
