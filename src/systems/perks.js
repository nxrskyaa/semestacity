// Sum the gameplay perks of everything the player has equipped (see src/data/cosmetics.js).
import { ITEM_BY_ID, perkLines } from '../data/cosmetics.js';

const ZERO = { move: 0, rainMove: 0, faucet: 0, reward: 0, dmg: 0, gun: 0, bomb: 0, run: 0, jump: 0, cooldown: 0, armor: 0, regen: 0, shield: 0 };

export function computePerks(equipped = {}) {
  const p = { ...ZERO };
  for (const id of Object.values(equipped || {})) {
    const it = ITEM_BY_ID[id];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.perk || {})) p[k] = (p[k] || 0) + v;
  }
  p.armor = Math.min(p.armor, 0.5);
  p.cooldown = Math.min(p.cooldown, 0.5);
  return p;
}

/** only the perks that matter in the holo battle, as multipliers for src/combat/battle.js */
export function battleMods(p) {
  return {
    dmg: 1 + p.dmg, gun: 1 + p.gun, bomb: 1 + p.bomb, run: 1 + p.run, jump: 1 + p.jump,
    cooldown: 1 - p.cooldown, armor: p.armor, regen: p.regen, shield: p.shield,
  };
}

/** perk lines for every equipped item: [{ icon, lines }] */
export function equippedPerkSummary(equipped = {}, lang = 'en') {
  return Object.values(equipped || {}).map((id) => ITEM_BY_ID[id]).filter(Boolean)
    .map((it) => ({ icon: it.icon, lines: perkLines(it, lang) }));
}
