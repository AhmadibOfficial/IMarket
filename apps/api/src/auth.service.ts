import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { tokenHash, verifyPassword, hashPassword } from '@imarket/commerce-domain/auth.cjs';
import { DbService } from './db.service';

export type Principal = { id: string; role: 'buyer' | 'merchant' | 'admin'; merchant_id: string | null };
export function objectInput(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k))) {
    throw new BadRequestException('Invalid request fields');
  }
  return input as Record<string, unknown>;
}
@Injectable()
export class AuthService {
  // A real scrypt comparison for unknown aliases reduces account enumeration via timing.
  private readonly dummy = hashPassword(randomBytes(32).toString('hex'));
  constructor(@Inject(DbService) private readonly db: DbService) {}
  async limit(key: string, maximum: number) {
    const result = await this.db.pool.query(`INSERT INTO auth_limits(key_hash,attempts,resets_at)
      VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN auth_limits.resets_at <= now() THEN 1 ELSE auth_limits.attempts+1 END,
      resets_at=CASE WHEN auth_limits.resets_at <= now() THEN now()+interval '15 minutes' ELSE auth_limits.resets_at END
      RETURNING attempts`, [tokenHash(key)]);
    if (result.rows[0].attempts > maximum) throw new HttpException('Rate limit exceeded',429);
  }
  async login(input: unknown, ip: string) {
    await this.limit(`login-ip:${ip}`, 30);
    const body=objectInput(input,['alias','password']);
    if (typeof body.alias !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(body.alias) ||
        typeof body.password !== 'string' || body.password.length < 14 || Buffer.byteLength(body.password) > 256) {
      throw new BadRequestException('Invalid credentials format');
    }
    await this.limit(`login-alias:${body.alias}`, 5);
    const result=await this.db.pool.query('SELECT id,role,password_hash,disabled FROM accounts WHERE alias=$1',[body.alias]);
    const account=result.rows[0];
    const valid=await verifyPassword(body.password,account?.password_hash ?? await this.dummy);
    // Admin access is fail-closed until reviewed MFA enrollment and verification exist.
    if (!valid || !account || account.disabled || account.role === 'admin') throw new UnauthorizedException('Invalid credentials');
    const token=randomBytes(32).toString('hex');
    await this.db.pool.query(`INSERT INTO sessions(token_hash,account_id,expires_at)
      VALUES($1,$2,now()+interval '15 minutes')`,[tokenHash(token),account.id]);
    return {accessToken:token,tokenType:'Bearer',expiresIn:900};
  }
  async authenticate(header: unknown): Promise<Principal> {
    if (typeof header !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(header)) throw new UnauthorizedException();
    const result=await this.db.pool.query(`SELECT a.id,a.role,a.merchant_id FROM sessions s
      JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT a.disabled`,[tokenHash(header.slice(7))]);
    const principal=result.rows[0] as Principal | undefined;
    if (!principal || principal.role === 'admin') throw new UnauthorizedException();
    return principal;
  }
  requireRole(principal: Principal, role: Principal['role']) {
    if (principal.role !== role || (role === 'merchant' && !principal.merchant_id)) throw new ForbiddenException();
  }
  async logout(header: string) {
    await this.db.pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(header.slice(7))]);
    return {revoked:true};
  }
}
