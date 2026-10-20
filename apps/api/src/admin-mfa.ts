import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Local synthetic enrollment only. The encryption key is supplied by the operator,
// separately from PostgreSQL; missing/invalid keys always fail closed.
function key(): Buffer {
  const value = process.env.IMARKET_MFA_KEY;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error('MFA encryption key unavailable');
  return Buffer.from(value, 'hex');
}
export function encryptSeed(seed: string, accountId: string): string {
  if (!/^[a-f0-9]{40}$/.test(seed)) throw new Error('Invalid MFA seed');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(accountId));
  const ciphertext = Buffer.concat([cipher.update(seed, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(x => x.toString('hex')).join('.');
}
export function decryptSeed(encrypted: string, accountId: string): string {
  if (!/^[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]{80}$/.test(encrypted)) throw new Error('Invalid encrypted seed');
  const [iv, tag, ciphertext] = encrypted.split('.').map(x => Buffer.from(x, 'hex'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(accountId)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString('utf8');
}
export function totp(seed: string, step: number): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', Buffer.from(seed, 'hex')).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(seed: string, code: unknown, lastStep: number, now = Date.now()): number | null {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && step >= 0 && timingSafeEqual(Buffer.from(totp(seed, step)), Buffer.from(code))) return step;
  }
  return null;
}
