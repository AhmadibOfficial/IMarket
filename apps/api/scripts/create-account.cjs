'use strict';
// Operator-only local fixture provisioning. Read secrets from stdin, never argv or logs.
if (process.env.NODE_ENV === 'production' || process.env.APP_DEMO_MODE !== 'true') throw Error('Local demo mode required');
const {Client}=require('pg');
const {encryptSeed}=require('../dist/admin-mfa');
const {hashPassword}=require('@imarket/commerce-domain/auth.cjs');
(async()=>{
  let source='';
  for await (const chunk of process.stdin) {
    source+=chunk;
    if(Buffer.byteLength(source)>2048) throw Error('Input too large');
  }
  const input=JSON.parse(source);
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['alias','password','role','merchantAlias','mfaSeed'].includes(k))) throw Error('Invalid fixture');
  if(!/^demo_[a-zA-Z0-9_-]{3,27}$/.test(input.alias) || !['buyer','merchant','admin'].includes(input.role)) throw Error('Synthetic alias and buyer/merchant role required');
  if(input.role==='merchant' && (typeof input.merchantAlias!=='string' || !/^demo_[a-zA-Z0-9_-]{3,27}$/.test(input.merchantAlias))) throw Error('Synthetic merchant alias required');
  if(input.role==='admin' && (typeof input.mfaSeed!=='string' || !/^[a-f0-9]{40}$/.test(input.mfaSeed))) throw Error('MFA seed required');
  if(input.role!=='admin' && input.mfaSeed!==undefined) throw Error('Unexpected seed');
  const passwordHash=await hashPassword(input.password);
  const client=new Client({connectionString:process.env.DATABASE_URL || 'postgres://imarket:local_only_change_me@127.0.0.1:5433/imarket'});
  await client.connect();
  try {
    await client.query('BEGIN');
    let merchantId=null;
    if(input.role==='merchant') {
      const r=await client.query('INSERT INTO merchants(alias) VALUES($1) ON CONFLICT(alias) DO UPDATE SET alias=EXCLUDED.alias RETURNING id',[input.merchantAlias]);
      merchantId=r.rows[0].id;
    }
    const account=await client.query('INSERT INTO accounts(alias,password_hash,role,merchant_id) VALUES($1,$2,$3,$4) RETURNING id',[input.alias,passwordHash,input.role,merchantId]);
    if(input.role==='admin') {
      const id=account.rows[0].id;
      await client.query('INSERT INTO admin_mfa(account_id,encrypted_seed) VALUES($1,$2)',[id,encryptSeed(input.mfaSeed,id)]);
      await client.query("INSERT INTO marketplace_audit(actor_id,action,subject_id) VALUES($1,'admin.enroll',$1)",[id]);
    }
    await client.query('COMMIT');
    console.log('Synthetic local account created.');
  } catch(e) {await client.query('ROLLBACK');throw e;}
  finally {await client.end();}
})().catch(()=>{console.error('Local account creation failed; check input and database availability.');process.exitCode=1;});
