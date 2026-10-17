// Appearance data model: defaults, option lists (for the creator), cast presets, random + sanitize.
import { rng } from '../core/util.js';
import { HEADWEAR_IDS, AURA_IDS, UMBRELLA_STYLES } from '../data/cosmetics.js';

export const DEFAULT_APPEARANCE = {
  name: 'Player',
  body: 'male',
  height: 1.0,
  build: 1.0,
  skin: '#f4d2ba',
  hairStyle: 'spiky',
  hairColor: '#e8442a',
  hairStreak: null,      // hex colour of a single accent lock (e.g. red streak), null = none
  eyeColor: '#3b6fd8',
  eyeColor2: null,       // character's LEFT eye colour (heterochromia); null = same as eyeColor
  eyeStyle: 'round',
  brows: 'natural',
  facePaint: 'none',
  neckTattoo: 'none',
  top: 'hoodie',
  topColor: '#8c8f99',
  topColor2: '#e8e3d5',
  bottom: 'pants',
  bottomColor: '#24252b',
  shoes: 'sneakers',
  shoesColor: '#f1f1ee',
  accessory: 'none',
  accessoryColor: '#2a2d36',
  accessory2: 'none',
  accessory2Color: '#c94b4b',
  accessory3: 'none',
  accessory3Color: '#e8e3d5',
  headwear: 'none',
  aura: 'none',
  umbrella: true,
  umbrellaStyle: 'clear',
  umbrellaColor: '#dff3ff',
};

const L = (id, label) => ({ id, label });

const HAIR_MALE = [
  L('spiky', 'Spiky Anime'), L('messy', 'Messy Fringe'), L('undercut', 'Undercut'), L('sideswept', 'Side-Swept Bangs'),
  L('wolf', 'Wolf Cut'), L('curtain', 'Curtain Part'), L('short', 'Neat Short'), L('mop', 'Shaggy Bob'), L('buzz', 'Buzz'),
];
const HAIR_FEMALE = [
  L('twintails', 'Wavy Twin Tails'), L('straight', 'Long + Blunt Bangs'), L('bob', 'Bob'), L('ponytail', 'Ponytail'),
  L('odango', 'Odango Buns'), L('wavy', 'Wavy Long'), L('hime', 'Hime Cut'), L('pixie', 'Pixie'),
];

export const OPTIONS = {
  body: [L('male', 'Cowok · Male'), L('female', 'Cewek · Female')],
  hairStyleMale: HAIR_MALE,
  hairStyleFemale: HAIR_FEMALE,
  hairStyle: [...HAIR_MALE, ...HAIR_FEMALE],
  eyeStyle: [L('round', 'Round'), L('doll', 'Doll'), L('sharp', 'Sharp'), L('soft', 'Gentle'), L('sleepy', 'Sleepy')],
  brows: [L('natural', 'Natural'), L('straight', 'Straight'), L('thick', 'Bold'), L('thin', 'Thin'), L('angled', 'Confident')],
  top: [
    L('hoodie', 'Hoodie'), L('bearhoodie', 'Bear Hoodie'), L('tshirt', 'T-Shirt'), L('jacket', 'Bomber'), L('blazer', 'Blazer'),
    L('coat', 'Coat + Shirt'), L('sweater', 'Sweater'), L('puffcrop', 'Puff Top'), L('onesie', 'Onesie'), L('tank', 'Tank Top'),
  ],
  bottom: [L('pants', 'Pants'), L('joggers', 'Joggers'), L('shorts', 'Shorts'), L('skirt', 'Pleated Skirt'), L('miniskirt', 'Chain Mini'), L('cargo', 'Cargo')],
  shoes: [L('sneakers', 'Sneakers'), L('boots', 'Boots'), L('loafers', 'Loafers'), L('warmers', 'Leg Warmers')],
  accessory: [
    L('none', 'None'), L('glasses', 'Glasses'), L('cap', 'Cap'), L('headphones', 'Headphones'), L('beanie', 'Beanie'),
    L('scarf', 'Scarf'), L('mask', 'Mask'), L('apron', 'Apron'), L('choker', 'Bow Choker'), L('headband', 'Headband'),
  ],
  headwear: HEADWEAR_IDS.map((id) => L(id, id)),
  aura: AURA_IDS.map((id) => L(id, id)),
  umbrellaStyle: UMBRELLA_STYLES.map((id) => L(id, id)),
  facePaint: [L('none', 'None'), L('clown', 'Clown')],
  neckTattoo: [L('none', 'None'), L('dragon', 'Dragon')],
  palettes: {
    skin: ['#fdeae0', '#f7e0d4', '#f6dcc8', '#efc9ad', '#e2b08a', '#c98e64', '#a46a44', '#7a4a2e'],
    hair: ['#e8442a', '#1d1a22', '#1b2340', '#3a2a24', '#6b4430', '#a8743f', '#b8a89a', '#eee3bb', '#f1eee8', '#a9aab8', '#c8b6e8', '#3d6fd6', '#2fb39b', '#e86aa0'],
    eye: ['#3b6fd8', '#4fb8e8', '#3fd6c8', '#46c35a', '#8a5a2b', '#2a2630', '#d0453a', '#9b59d0', '#e3a72f', '#3a3a48'],
    cloth: ['#8c8f99', '#24252b', '#f1f1ee', '#e8e3d5', '#2f6b4a', '#3c9a5f', '#203a6b', '#1c2440', '#2d8f9a', '#6a3a2a', '#8a5236', '#6a1622', '#c8202a', '#e6b450', '#7a5ac8', '#e86aa0', '#3a3f4f', '#c3c7cf', '#141414'],
    umbrella: ['#dff3ff', '#ffe1ec', '#e7ffe9', '#fff4cf', '#e7ddff', '#dcdcdc'],
  },
};

/** body-aware defaults used when the creator switches gender */
export const GENDER_DEFAULTS = {
  male: { hairStyle: 'spiky', eyeStyle: 'round', brows: 'natural', bottom: 'pants', shoes: 'sneakers' },
  female: { hairStyle: 'twintails', eyeStyle: 'doll', brows: 'thin', bottom: 'skirt', shoes: 'loafers' },
};
export function hairOptionsFor(body) { return body === 'female' ? HAIR_FEMALE : HAIR_MALE; }

const ids = (k) => OPTIONS[k].map((o) => o.id);

const D0 = DEFAULT_APPEARANCE;
/** Ready-made cast (NPC presets). */
export const PRESETS = {
  hero: { ...D0, name: 'Player' },
  heroine: {
    ...D0, name: 'Player', body: 'female', height: 0.98, skin: '#f6d6c2',
    hairStyle: 'ponytail', hairColor: '#5a3a2e', eyeColor: '#7a4fd0', eyeStyle: 'doll', brows: 'thin',
    top: 'sweater', topColor: '#e8e3d5', topColor2: '#e86aa0', bottom: 'skirt', bottomColor: '#203a6b',
    shoes: 'loafers', shoesColor: '#3a2418', accessory: 'choker', accessoryColor: '#e86aa0',
    umbrella: true, umbrellaColor: '#ffe1ec',
  },
  eric: {
    ...D0, name: 'Eric Argent', body: 'male', height: 1.03, skin: '#f6d8c4',
    hairStyle: 'sideswept', hairColor: '#f0dc9a', eyeColor: '#3fd6c8', eyeColor2: '#46c35a', eyeStyle: 'sharp', brows: 'angled',
    neckTattoo: 'dragon',
    top: 'coat', topColor: '#1c2440', topColor2: '#c8202a', bottom: 'pants', bottomColor: '#191c28',
    shoes: 'boots', shoesColor: '#1b1b20', accessory: 'headband', accessoryColor: '#17171b', umbrella: false,
  },
  ade: {
    ...D0, name: 'Ade', body: 'male', height: 0.99, skin: '#c98e64',
    hairStyle: 'curtain', hairColor: '#1d1a22', eyeColor: '#3a2a24', eyeStyle: 'soft', brows: 'straight',
    top: 'hoodie', topColor: '#203a6b', topColor2: '#5ee7ff', bottom: 'joggers', bottomColor: '#2a2d36',
    shoes: 'sneakers', shoesColor: '#3a3f4f', accessory: 'glasses', accessoryColor: '#1a1a20',
    accessory2: 'headphones', accessory2Color: '#c3c7cf', umbrella: false,
  },
  koushik: {
    ...D0, name: 'Koushik', body: 'male', height: 1.0, skin: '#a46a44',
    hairStyle: 'short', hairColor: '#17141a', eyeColor: '#4a3020', eyeStyle: 'round', brows: 'thick',
    top: 'coat', topColor: '#2f4a6b', topColor2: '#e8e3d5', bottom: 'pants', bottomColor: '#2e3036',
    shoes: 'loafers', shoesColor: '#3a2418', umbrella: false,
  },
  rollins: {
    ...D0, name: 'Rollins', body: 'male', height: 1.02, build: 1.1, skin: '#efc9ad',
    hairStyle: 'short', hairColor: '#a9aab8', eyeColor: '#3a4a60', eyeStyle: 'soft', brows: 'thick',
    top: 'blazer', topColor: '#2a2f3c', topColor2: '#9e2f3a', bottom: 'pants', bottomColor: '#252833',
    shoes: 'loafers', shoesColor: '#1c1410', accessory: 'glasses', accessoryColor: '#8a6a3a', umbrella: false,
  },
  dikzzy: {
    ...D0, name: 'Dikzzy', body: 'male', height: 0.97, skin: '#f4d2ba',
    hairStyle: 'mop', hairColor: '#141418', hairStreak: '#d42a2a', eyeColor: '#2a2630', eyeStyle: 'sleepy', brows: 'thin',
    facePaint: 'clown', headwear: 'bearhood_white',
    top: 'onesie', topColor: '#f4f2ec', topColor2: '#f2c440', bottom: 'pants', bottomColor: '#f4f2ec',
    shoes: 'sneakers', shoesColor: '#f4f2ec', umbrella: false,
  },
  baster: {
    ...D0, name: 'Baster', body: 'male', height: 0.96, skin: '#f6dccc',
    hairStyle: 'messy', hairColor: '#1b2340', eyeColor: '#4fb8e8', eyeStyle: 'round', brows: 'natural',
    headwear: 'bearhood_brown',
    top: 'bearhoodie', topColor: '#8a5236', topColor2: '#c9a27a', bottom: 'joggers', bottomColor: '#3d2a20',
    shoes: 'sneakers', shoesColor: '#e8e3d5', umbrella: true, umbrellaColor: '#fff4cf',
  },
  littlechip: {
    ...D0, name: 'Littlechip', body: 'female', height: 0.95, skin: '#f9dccf',
    hairStyle: 'twintails', hairColor: '#aa9d8f', eyeColor: '#2a2630', eyeStyle: 'doll', brows: 'thin',
    top: 'puffcrop', topColor: '#6a1622', topColor2: '#efe2c4', bottom: 'miniskirt', bottomColor: '#1a1a1e',
    shoes: 'warmers', shoesColor: '#1c1c20', accessory: 'choker', accessoryColor: '#141416', umbrella: false,
  },
};

/** canonical preset ids (aliases below are hidden from enumeration) */
export const PRESET_IDS = ['hero', 'heroine', 'eric', 'ade', 'koushik', 'rollins', 'dikzzy', 'baster', 'littlechip'];
const ALIASES = { rival: 'dikzzy', guide: 'eric', engineer: 'ade', agentdev: 'koushik', rwa: 'rollins', clerk: 'littlechip', vendor: 'baster' };
for (const [a, id] of Object.entries(ALIASES)) Object.defineProperty(PRESETS, a, { value: PRESETS[id], enumerable: false });

const HEX = /^#[0-9a-f]{6}$/i;
const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const colOrNull = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? Math.min(b, Math.max(a, v)) : d);

const LEGACY_BODY = { masc: 'male', fem: 'female' };
const LEGACY_HAIR = { long: 'straight', bun: 'odango', twintail: 'twintails' };

/** coerce any object (e.g. from a save) into a valid appearance */
export function sanitizeAppearance(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const D = DEFAULT_APPEARANCE;
  const accs = ids('accessory');
  const body = pick(LEGACY_BODY[o.body] || o.body, ids('body'), D.body);
  const hair = LEGACY_HAIR[o.hairStyle] || o.hairStyle;
  return {
    name: (typeof o.name === 'string' && o.name.trim() ? o.name.trim() : D.name).slice(0, 14),
    body,
    height: num(o.height, 0.92, 1.08, D.height),
    build: num(o.build, 0.85, 1.2, D.build),
    skin: col(o.skin, D.skin),
    hairStyle: pick(hair, ids('hairStyle'), GENDER_DEFAULTS[body].hairStyle),
    hairColor: col(o.hairColor, D.hairColor),
    hairStreak: colOrNull(o.hairStreak),
    eyeColor: col(o.eyeColor, D.eyeColor),
    eyeColor2: colOrNull(o.eyeColor2),
    eyeStyle: pick(o.eyeStyle, ids('eyeStyle'), D.eyeStyle),
    brows: pick(o.brows, ids('brows'), D.brows),
    facePaint: pick(o.facePaint, ids('facePaint'), 'none'),
    neckTattoo: pick(o.neckTattoo, ids('neckTattoo'), 'none'),
    top: pick(o.top, ids('top'), D.top),
    topColor: col(o.topColor, D.topColor),
    topColor2: col(o.topColor2, D.topColor2),
    bottom: pick(o.bottom, ids('bottom'), D.bottom),
    bottomColor: col(o.bottomColor, D.bottomColor),
    shoes: pick(o.shoes, ids('shoes'), D.shoes),
    shoesColor: col(o.shoesColor, D.shoesColor),
    accessory: pick(o.accessory, accs, D.accessory),
    accessoryColor: col(o.accessoryColor, D.accessoryColor),
    accessory2: pick(o.accessory2, accs, D.accessory2),
    accessory2Color: col(o.accessory2Color, D.accessory2Color),
    accessory3: pick(o.accessory3, accs, D.accessory3),
    accessory3Color: col(o.accessory3Color, D.accessory3Color),
    headwear: pick(o.headwear, HEADWEAR_IDS, 'none'),
    aura: pick(o.aura, AURA_IDS, 'none'),
    umbrella: typeof o.umbrella === 'boolean' ? o.umbrella : D.umbrella,
    umbrellaStyle: pick(o.umbrellaStyle, UMBRELLA_STYLES, 'clear'),
    umbrellaColor: col(o.umbrellaColor, D.umbrellaColor),
  };
}

/** deterministic random appearance (seed optional) */
export function randomAppearance(seed) {
  const r = rng(seed === undefined ? (Math.random() * 1e9) | 0 : seed);
  const P = OPTIONS.palettes;
  const any = (a) => a[Math.floor(r() * a.length) % a.length];
  const body = r() < 0.5 ? 'male' : 'female';
  const fem = body === 'female';
  const accs = ['none', 'none', 'none', 'glasses', 'cap', 'headphones', 'beanie', 'scarf', 'mask', fem ? 'choker' : 'none'];
  const topsM = ['hoodie', 'bearhoodie', 'tshirt', 'jacket', 'blazer', 'coat', 'sweater', 'tank'];
  const topsF = ['hoodie', 'tshirt', 'jacket', 'blazer', 'sweater', 'puffcrop', 'puffcrop', 'coat'];
  const bottom = fem ? any(['skirt', 'miniskirt', 'shorts', 'pants', 'skirt', 'joggers']) : any(['pants', 'joggers', 'cargo', 'shorts', 'pants']);
  return sanitizeAppearance({
    name: !fem ? any(['Rendra', 'Kai', 'Bima', 'Yuto', 'Arif', 'Ren', 'Dio']) : any(['Sari', 'Mika', 'Ayu', 'Hana', 'Laras', 'Yuna', 'Tari']),
    body,
    height: 0.94 + r() * 0.12,
    build: 0.92 + r() * 0.16,
    skin: any(P.skin),
    hairStyle: any(hairOptionsFor(body)).id,
    hairColor: any(P.hair),
    eyeColor: any(P.eye),
    eyeStyle: fem ? any(['round', 'doll', 'soft', 'doll']) : any(['round', 'sharp', 'soft', 'sleepy']),
    brows: fem ? any(['thin', 'natural', 'straight']) : any(['natural', 'straight', 'thick', 'angled']),
    top: any(fem ? topsF : topsM), topColor: any(P.cloth), topColor2: any(P.cloth),
    bottom, bottomColor: any(['#24252b', '#2a2d36', '#3d3a2c', '#203a6b', '#141414', '#6a5a48', '#3a3f4f', '#8c8f99']),
    shoes: fem ? any(['sneakers', 'boots', 'loafers', 'warmers']) : any(['sneakers', 'boots', 'loafers']),
    shoesColor: any(['#f1f1ee', '#24252b', '#3a2418', '#9e2f3a', '#203a6b', '#e8e3d5']),
    accessory: any(accs), accessoryColor: any(P.cloth),
    accessory2: 'none', accessory2Color: any(P.cloth),
    accessory3: 'none', accessory3Color: any(P.cloth),
    umbrella: r() < 0.6, umbrellaColor: any(P.umbrella),
  });
}
