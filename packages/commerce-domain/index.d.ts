export function assertMoney(amount: number): number;
export function groupSavings(priceKobo: number, groupPriceKobo: number): number;
export function groupState(input: { members: number; minMembers: number; maxMembers: number; expiresAt: string; now?: number }): 'confirmed' | 'expired' | 'open' | 'full';
export function validateCampaign(input: { minMembers: number; maxMembers: number; durationHours: number }): true;
export function validateDemoAlias(alias: unknown): string;
export function totalKobo(priceKobo: number, quantity: number): number;
