'use strict';
const { randomBytes, scrypt: derive, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(derive);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || Buffer.byteLength(password) > 256) throw new Error('INVALID_PASSWORD');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 32, options);
  return `scrypt-v1$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 256) return false;
  if (typeof encoded !== 'string' || !/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded)) return false;
  const [,salt,key] = encoded.split('$');
  return timingSafeEqual(await scrypt(password, salt, 32, options), Buffer.from(key,'hex'));
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
module.exports = { hashPassword, verifyPassword, tokenHash };
