export function hashPassword(password: string): Promise<string>;
export function verifyPassword(password: unknown, encoded: unknown): Promise<boolean>;
export function tokenHash(token: string): string;
