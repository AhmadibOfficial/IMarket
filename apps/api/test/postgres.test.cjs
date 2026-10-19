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
    for(let pass=0;pass<2;pass++) for(const file of ['001_init.sql','002_auth.sql']) await pool.query(readFileSync(`${__dirname}/../migrations/${file}`,'utf8'));
    const tenants=await pool.query("INSERT INTO merchants(alias) VALUES('demo_tenant_a'),('demo_tenant_b') RETURNING id");
    const [a,b]=tenants.rows.map(x=>x.id);
    const product=(await pool.query('SELECT id FROM products LIMIT 1')).rows[0].id;
    await pool.query('UPDATE products SET merchant_id=$1 WHERE id=$2',[a,product]);
    const api=new ApiController({pool});
    const input={productId:product,minMembers:2,maxMembers:4,durationHours:1};
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
  } finally {
    if(pool) await pool.end();
    if(created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
