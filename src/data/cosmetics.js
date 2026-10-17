// Gacha catalog. Every item maps onto an appearance field the avatar renders:
//   headwear: avatar `headwear` field (rendered by src/characters/headwear.js)
//   aura:     avatar `aura` field (particle/orbit effect around the character)
//   umbrella: avatar `umbrellaStyle` (+ optional umbrellaColor)
//   title:    text shown under the player's name tag / in the wallet card
// Rarity weights sum to 100.

export const RARITY = {
  common: { label: 'Common', color: '#9fb0d6', weight: 60, stars: 1 },
  rare: { label: 'Rare', color: '#5ee7ff', weight: 28, stars: 2 },
  epic: { label: 'Epic', color: '#b49cff', weight: 10, stars: 3 },
  legendary: { label: 'Legendary', color: '#ffcf4a', weight: 2, stars: 4 },
};

const I = (id, type, rarity, name, value, icon, extra = {}) => ({ id, type, rarity, name, value, icon, perk: {}, ...extra });

export const ITEMS = [
  // ---- common
  I('title_rainwalker', 'title', 'common', { en: 'Title: Rain Walker', id: 'Gelar: Rain Walker' }, 'Rain Walker', '🏷️', { perk: { move: 0.04 } }),
  I('title_nightowl', 'title', 'common', { en: 'Title: Night Owl', id: 'Gelar: Night Owl' }, 'Night Owl', '🏷️', { perk: { faucet: 1 } }),
  I('title_konbini', 'title', 'common', { en: 'Title: Konbini Regular', id: 'Gelar: Konbini Regular' }, 'Konbini Regular', '🏷️', { perk: { reward: 0.10 } }),
  I('title_rookie', 'title', 'common', { en: 'Title: Holo Rookie', id: 'Gelar: Holo Rookie' }, 'Holo Rookie', '🏷️', { perk: { dmg: 0.05 } }),
  I('umb_sakura', 'umbrella', 'common', { en: 'Sakura Umbrella', id: 'Payung Sakura' }, 'clear', '🌂', { color: '#ffb3d1' , perk: { rainMove: 0.06 } }),
  I('umb_mint', 'umbrella', 'common', { en: 'Mint Umbrella', id: 'Payung Mint' }, 'clear', '🌂', { color: '#a8f0d8' , perk: { rainMove: 0.06 } }),
  I('umb_amber', 'umbrella', 'common', { en: 'Amber Umbrella', id: 'Payung Amber' }, 'clear', '🌂', { color: '#ffd38a' , perk: { rainMove: 0.06 } }),
  // ---- rare
  I('hw_catears', 'headwear', 'rare', { en: 'Cat Ears', id: 'Telinga Kucing' }, 'catears', '🐱', { perk: { run: 0.12 } }),
  I('hw_bunnyears', 'headwear', 'rare', { en: 'Bunny Ears', id: 'Telinga Kelinci' }, 'bunnyears', '🐰', { perk: { jump: 0.22 } }),
  I('hw_flowercrown', 'headwear', 'rare', { en: 'Flower Crown', id: 'Mahkota Bunga' }, 'flowercrown', '🌸', { perk: { regen: 4 } }),
  I('hw_headband', 'headwear', 'rare', { en: 'Fighter Headband', id: 'Ikat Kepala Petarung' }, 'headband', '🎗️', { perk: { gun: 0.18 } }),
  I('umb_neon', 'umbrella', 'rare', { en: 'Neon Umbrella', id: 'Payung Neon' }, 'neon', '☂️', { color: '#5ee7ff' , perk: { rainMove: 0.10 } }),
  I('title_builder', 'title', 'rare', { en: 'Title: DevNet Builder', id: 'Gelar: DevNet Builder' }, 'DevNet Builder', '🏷️', { perk: { reward: 0.20 } }),
  // ---- epic
  I('hw_halo', 'headwear', 'epic', { en: 'Angel Halo', id: 'Halo Malaikat' }, 'halo', '😇', { perk: { shield: 160 } }),
  I('hw_horns', 'headwear', 'epic', { en: 'Little Devil Horns', id: 'Tanduk Iblis Kecil' }, 'devilhorns', '😈', { perk: { bomb: 0.30 } }),
  I('hw_bear_brown', 'headwear', 'epic', { en: 'Brown Bear Hood', id: 'Tudung Beruang Cokelat' }, 'bearhood_brown', '🐻', { perk: { armor: 0.14 } }),
  I('hw_bear_white', 'headwear', 'epic', { en: 'Polar Bear Hood', id: 'Tudung Beruang Kutub' }, 'bearhood_white', '🐻‍❄️', { perk: { armor: 0.10, regen: 2 } }),
  I('aura_sparkle', 'aura', 'epic', { en: 'Stardust Aura', id: 'Aura Debu Bintang' }, 'sparkle', '✨', { perk: { faucet: 2 } }),
  I('aura_hearts', 'aura', 'epic', { en: 'Heart Aura', id: 'Aura Hati' }, 'hearts', '💗', { perk: { regen: 3, reward: 0.10 } }),
  I('umb_starry', 'umbrella', 'epic', { en: 'Starry Night Umbrella', id: 'Payung Malam Berbintang' }, 'starry', '🌌', { color: '#3a3d8f' , perk: { rainMove: 0.12, jump: 0.10 } }),
  // ---- legendary
  I('hw_crown', 'headwear', 'legendary', { en: 'Golden Crown', id: 'Mahkota Emas' }, 'crown', '👑', { perk: { dmg: 0.12, shield: 120 } }),
  I('hw_rialocap', 'headwear', 'legendary', { en: 'Rialo Cap', id: 'Topi Rialo' }, 'rialocap', '🧢', { perk: { cooldown: 0.20, dmg: 0.05 } }),
  I('aura_rialo', 'aura', 'legendary', { en: 'Rialo Orbit Aura', id: 'Aura Orbit Rialo' }, 'rialoRing', '💠', { perk: { faucet: 5, reward: 0.25, dmg: 0.05 } }),
  I('umb_rialo', 'umbrella', 'legendary', { en: 'Rialo Umbrella', id: 'Payung Rialo' }, 'rialo', '☂️', { color: '#e8e3d5' , perk: { rainMove: 0.15, faucet: 1 } }),
  I('title_legend', 'title', 'legendary', { en: 'Title: Real-World Legend', id: 'Gelar: Real-World Legend' }, 'Real-World Legend', '🏆', { perk: { dmg: 0.10, reward: 0.25 } }),
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** all headwear / aura / umbrellaStyle values the avatar must support */
export const HEADWEAR_IDS = ['none', ...new Set(ITEMS.filter((i) => i.type === 'headwear').map((i) => i.value))];
export const AURA_IDS = ['none', ...new Set(ITEMS.filter((i) => i.type === 'aura').map((i) => i.value))];
export const UMBRELLA_STYLES = ['clear', ...new Set(ITEMS.filter((i) => i.type === 'umbrella').map((i) => i.value).filter((v) => v !== 'clear'))];

export const GACHA = {
  costSingle: 1,   // $RIALO
  costTen: 9,
  pityRare: 10,    // every 10th pull without rare+ is guaranteed rare+
  dupeRefund: 0.2, // $RIALO refunded for a duplicate
};

/**
 * Gameplay perks. Every item has one; equipped perks stack (see src/systems/perks.js).
 *   move      +% walk/run speed everywhere          rainMove  +% speed while walking in the rain
 *   faucet    +$RIALO on every faucet claim          reward    +% on quest / badge / battle rewards
 *   dmg       +% holo-battle damage                  gun/bomb  +% damage for that weapon
 *   run/jump  +% robot run speed / jump height       cooldown  −% weapon cooldowns
 *   armor     −% damage taken                        regen     HP regenerated per second
 *   shield    damage absorbed before HP is lost
 */
export const PERK_TEXT = {
  move: { en: '+{v}% move speed', id: '+{v}% kecepatan jalan', pct: true },
  rainMove: { en: '+{v}% speed in the rain', id: '+{v}% kecepatan saat hujan', pct: true },
  faucet: { en: '+{v} $RIALO per faucet claim', id: '+{v} $RIALO tiap klaim faucet' },
  reward: { en: '+{v}% $RIALO rewards', id: '+{v}% hadiah $RIALO', pct: true },
  dmg: { en: '+{v}% battle damage', id: '+{v}% damage battle', pct: true },
  gun: { en: '+{v}% gun damage', id: '+{v}% damage tembakan', pct: true },
  bomb: { en: '+{v}% bomb damage', id: '+{v}% damage bom', pct: true },
  run: { en: '+{v}% robot speed', id: '+{v}% kecepatan robot', pct: true },
  jump: { en: '+{v}% robot jump', id: '+{v}% lompatan robot', pct: true },
  cooldown: { en: '−{v}% weapon cooldown', id: '−{v}% cooldown senjata', pct: true },
  armor: { en: '−{v}% damage taken', id: '−{v}% damage diterima', pct: true },
  regen: { en: '+{v} HP/s regen in battle', id: '+{v} HP/detik regen saat battle' },
  shield: { en: '{v} HP shield in battle', id: 'Perisai {v} HP saat battle' },
};

/** human-readable perk lines for an item, in 'en' or 'id' */
export function perkLines(item, lang = 'en') {
  return Object.entries(item.perk || {}).map(([k, v]) => {
    const d = PERK_TEXT[k];
    if (!d) return '';
    return (d[lang] || d.en).replace('{v}', d.pct ? Math.round(v * 100) : v);
  }).filter(Boolean);
}
