const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashPassword,verifyPassword,tokenHash}=require('./auth.cjs');
test('scrypt uses independent salts, validates passwords and fails closed on malformed hashes',async()=>{
  const password='synthetic-test-password';
  const [a,b]=await Promise.all([hashPassword(password),hashPassword(password)]);
  assert.notEqual(a,b);
  assert(!a.includes(password));
  assert(await verifyPassword(password,a));
  assert.equal(await verifyPassword('incorrect-password',a),false);
  for(const encoded of ['',null,'scrypt-v1$bad$bad']) assert.equal(await verifyPassword(password,encoded),false);
  assert.equal(await verifyPassword('x'.repeat(257),a),false);
  await assert.rejects(hashPassword('short'));
  await assert.rejects(hashPassword('x'.repeat(257)));
});
test('session digest is deterministic and does not store the bearer token',()=>{
  const token='a'.repeat(64);
  assert.match(tokenHash(token),/^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(token),token);
  assert.equal(tokenHash(token),tokenHash(token));
});
