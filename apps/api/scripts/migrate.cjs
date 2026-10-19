'use strict';
if (process.env.NODE_ENV === 'production') throw new Error('IMarket demo migration cannot run in production.');
const {Client}=require('pg');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const url=process.env.DATABASE_URL || 'postgres://imarket:local_only_change_me@127.0.0.1:5433/imarket';
const client=new Client({connectionString:url});
(async()=>{
  await client.connect();
  try {
    await client.query(readFileSync(resolve(__dirname,'../migrations/001_init.sql'),'utf8'));
    console.log('Applied IMK-001 demo schema / idempotent seed.');
  } finally {await client.end();}
})().catch((e)=>{console.error('Migration error:',e.message);process.exitCode=1;});
