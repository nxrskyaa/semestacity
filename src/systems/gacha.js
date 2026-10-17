// Gacha logic (pure, DOM-free). Catalog lives in src/data/cosmetics.js.
//   save.inventory = { [itemId]: count }
//   save.equipped  = { headwear, aura, umbrella, title }   (item ids or null)
//   save.gacha     = { pity, pulls, legendaries, history: [{id, rarity, time}] }
// Pity: every GACHA.pityRare-th pull in a row without rare+ is forced to rare+.
import { ITEMS, ITEM_BY_ID, RARITY, GACHA } from '../data/cosmetics.js';

export const SLOTS = ['headwear', 'aura', 'umbrella', 'title'];
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const BY_RARITY = Object.fromEntries(RARITY_ORDER.map((r) => [r, ITEMS.filter((i) => i.type !== undefined && i.rarity === r)]));

export function ensureGachaSave(save) {
  if (!save.inventory || typeof save.inventory !== 'object') save.inventory = {};
  const eq = save.equipped && typeof save.equipped === 'object' ? save.equipped : {};
  save.equipped = Object.fromEntries(SLOTS.map((s) => [s, ITEM_BY_ID[eq[s]] ? eq[s] : null]));
  const g = save.gacha && typeof save.gacha === 'object' ? save.gacha : {};
  save.gacha = { pity: g.pity | 0, pulls: g.pulls | 0, legendaries: g.legendaries | 0, history: Array.isArray(g.history) ? g.history : [] };
  return save;
}

export const pullCost = (n) => (n === 10 ? GACHA.costTen : GACHA.costSingle * n);

/** probability of each rarity in % (from RARITY weights) */
export function rates() {
  const total = RARITY_ORDER.reduce((s, r) => s + RARITY[r].weight, 0);
  return RARITY_ORDER.map((r) => ({ rarity: r, pct: (RARITY[r].weight / total) * 100, count: BY_RARITY[r].length }));
}

/** weighted rarity roll; rarePlus forces rare or better (pity), weights renormalised */
export function rollRarity(rng = Math.random, rarePlus = false) {
  const pool = rarePlus ? RARITY_ORDER.slice(1) : RARITY_ORDER;
  const total = pool.reduce((s, r) => s + RARITY[r].weight, 0);
  let x = rng() * total;
  for (const r of pool) { x -= RARITY[r].weight; if (x < 0) return r; }
  return pool[pool.length - 1];
}

/** pulls left until the pity guarantee (1 = the next pull is guaranteed rare+) */
export const pityLeft = (save) => GACHA.pityRare - (save.gacha?.pity | 0);

/**
 * Roll n items and apply them to save (inventory, pity, history).
 * Returns [{ item, rarity, dupe, count, pity: bool, isNew: bool }].
 */
export function pull(save, n = 1, rng = Math.random) {
  ensureGachaSave(save);
  const g = save.gacha;
  const out = [];
  for (let k = 0; k < n; k++) {
    const forced = g.pity >= GACHA.pityRare - 1;
    const rarity = rollRarity(rng, forced);
    const pool = BY_RARITY[rarity];
    const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const before = save.inventory[item.id] | 0;
    save.inventory[item.id] = before + 1;
    g.pity = rarity === 'common' ? g.pity + 1 : 0;
    g.pulls++;
    if (rarity === 'legendary') g.legendaries++;
    g.history.unshift({ id: item.id, rarity, time: Date.now() });
    if (g.history.length > 50) g.history.length = 50;
    out.push({ item, rarity, dupe: before > 0, isNew: before === 0, count: before + 1, pity: forced && rarity !== 'common' });
  }
  return out;
}

export const refundFor = (results) => Math.round(results.filter((r) => r.dupe).length * GACHA.dupeRefund * 100) / 100;

/**
 * Pay with the chain, roll, refund dupes, award points.
 * Rejects (before rolling) with err.code 'INSUFFICIENT_FUNDS' if broke.
 * opts.onSigned(tx) fires as soon as the payment confirms (before refunds).
 */
export async function buyPulls(chain, save, n = 1, { rng = Math.random, onSigned } = {}) {
  const cost = pullCost(n);
  const tx = await chain.spend(cost, n === 10 ? 'Semesta Gacha ×10' : `Semesta Gacha ×${n}`);
  onSigned?.(tx);
  const results = pull(save, n, rng);
  chain.addPoints(5 * n, `gacha pull ×${n}`); // also persists save via onChange
  const refund = refundFor(results);
  const refundTx = refund > 0 ? chain.reward(refund, 'dupe refund', { kind: 'refund' }) : null;
  return { tx, results, refund, refundTx };
}

// ------------------------------------------------------------------ collection / equip
export function equip(save, itemId) {
  ensureGachaSave(save);
  const item = ITEM_BY_ID[itemId];
  if (!item || !(save.inventory[itemId] > 0)) return null;
  save.equipped[item.type] = itemId;
  return item;
}
export function unequip(save, slot) {
  ensureGachaSave(save);
  if (SLOTS.includes(slot)) save.equipped[slot] = null;
}
export const isEquipped = (save, itemId) => !!itemId && save.equipped?.[ITEM_BY_ID[itemId]?.type] === itemId;

export function collectionStats(save) {
  ensureGachaSave(save);
  const owned = ITEMS.filter((i) => save.inventory[i.id] > 0).length;
  return { owned, total: ITEMS.length };
}

/** simulate N rolls without touching a real save (for tests / rate checks) */
export function simulate(N = 1000, rng = Math.random) {
  const s = ensureGachaSave({});
  const res = pull(s, N, rng);
  const counts = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  for (const r of res) counts[r.rarity]++;
  let maxDry = 0, dry = 0;
  for (const r of res) { dry = r.rarity === 'common' ? dry + 1 : 0; maxDry = Math.max(maxDry, dry); }
  return { counts, maxCommonStreak: maxDry, pityHits: res.filter((r) => r.pity).length };
}

export { ITEMS, ITEM_BY_ID, RARITY, GACHA };
