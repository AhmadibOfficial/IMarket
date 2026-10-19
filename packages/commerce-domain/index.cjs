'use strict';
/** Currency calculations use integer NGN kobo; do not use floating-point money. */
function assertMoney(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_AMOUNT');
  return amount;
}
function groupSavings(priceKobo, groupPriceKobo) {
  assertMoney(priceKobo); assertMoney(groupPriceKobo);
  if (groupPriceKobo > priceKobo) throw new Error('GROUP_PRICE_EXCEEDS_REGULAR');
  return priceKobo - groupPriceKobo;
}
function groupState({members, minMembers, maxMembers, expiresAt, now = Date.now()}) {
  if (![members, minMembers, maxMembers].every(Number.isSafeInteger) || minMembers < 2 || maxMembers < minMembers || members < 0 || members > maxMembers) {
    throw new Error('INVALID_GROUP_CAPACITY');
  }
  if (!Number.isFinite(Date.parse(expiresAt))) throw new Error('INVALID_EXPIRY');
  if (now >= Date.parse(expiresAt)) return members >= minMembers ? 'confirmed' : 'expired';
  if (members === maxMembers) return 'full';
  return members >= minMembers ? 'confirmed' : 'open';
}
function validateCampaign({minMembers, maxMembers, durationHours}) {
  if (!Number.isSafeInteger(minMembers) || minMembers < 2 || minMembers > 100) throw new Error('INVALID_MIN_MEMBERS');
  if (!Number.isSafeInteger(maxMembers) || maxMembers < minMembers || maxMembers > 100) throw new Error('INVALID_MAX_MEMBERS');
  if (!Number.isSafeInteger(durationHours) || durationHours < 1 || durationHours > 168) throw new Error('INVALID_DURATION');
  return true;
}
function validateDemoAlias(alias) {
  if (typeof alias !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(alias)) throw new Error('INVALID_DEMO_ALIAS');
  return alias;
}
function totalKobo(priceKobo, quantity) {
  assertMoney(priceKobo);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('INVALID_QUANTITY');
  const result = priceKobo * quantity;
  if (!Number.isSafeInteger(result)) throw new Error('INVALID_AMOUNT');
  return result;
}
module.exports = { assertMoney, groupSavings, groupState, validateCampaign, validateDemoAlias, totalKobo };
