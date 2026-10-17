// Persistent settings + save game (localStorage, failure-tolerant) and i18n helper.
const SETTINGS_KEY = 'semesta-city-settings';
const SAVE_KEY = 'semesta-city-save';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const defaults = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en',
  quality: 'medium', master: 0.8, music: 0.55, sfx: 0.8, sens: 1, invertY: false, showKeys: true,
};
export const settings = Object.assign({}, defaults, read(SETTINGS_KEY) || {});
export const saveSettings = () => write(SETTINGS_KEY, settings);

/** translate a bilingual {en,id} object (or pass strings through), with {var} interpolation */
export function t(s, vars) {
  let out = s && typeof s === 'object' ? (s[settings.lang] ?? s.en) : (s ?? '');
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return out;
}

export function newSave(appearance) {
  return { v: 1, appearance, badges: [], heard: {}, quizBest: null, wins: 0, losses: 0, pos: null, created: Date.now() };
}
export const loadGame = () => {
  const s = read(SAVE_KEY);
  return s && s.v === 1 && s.appearance ? s : null;
};
export const saveGame = (s) => write(SAVE_KEY, s);
export const hasSave = () => !!loadGame();

/** UI strings */
export const STR = {
  newGame: { en: 'NEW GAME', id: 'GAME BARU' },
  newGameSub: { en: 'Create your character', id: 'Buat karaktermu' },
  cont: { en: 'CONTINUE', id: 'LANJUTKAN' },
  contSub: { en: 'Back to the rainy streets', id: 'Kembali ke jalanan hujan' },
  settings: { en: 'SETTINGS', id: 'PENGATURAN' },
  aboutRialo: { en: 'ABOUT RIALO', id: 'TENTANG RIALO' },
  credits: { en: 'CREDITS', id: 'KREDIT' },
  clickStart: { en: 'Click anywhere to start', id: 'Klik di mana saja untuk mulai' },
  subtitle: { en: 'Rainy Night · Rialo Edition', id: 'Malam Hujan · Edisi Rialo' },
  resume: { en: 'RESUME', id: 'LANJUT' },
  save: { en: 'SAVE GAME', id: 'SIMPAN' },
  quit: { en: 'QUIT TO TITLE', id: 'KE MENU UTAMA' },
  paused: { en: 'PAUSED', id: 'JEDA' },
  saved: { en: 'Game saved', id: 'Game tersimpan' },
  talk: { en: 'Talk to', id: 'Ngobrol dengan' },
  bye: { en: 'See you!', id: 'Sampai jumpa!' },
  clickLook: { en: 'Drag (or click to lock) to look around · Q/R rotate · Esc for menu', id: 'Geser mouse (atau klik untuk lock) buat lihat sekeliling · Q/R putar · Esc menu' },
  objective: { en: 'OBJECTIVES', id: 'MISI' },
  explore: { en: 'EXPLORATION', id: 'EKSPLORASI' },
  move: { en: 'Move', id: 'Jalan' }, run: { en: 'Run', id: 'Lari' }, jump: { en: 'Jump', id: 'Lompat' },
  interact: { en: 'Interact / Talk', id: 'Interaksi / Ngobrol' }, camera: { en: 'Drag to orbit camera', id: 'Geser untuk putar kamera' },
  rotate: { en: 'Rotate camera', id: 'Putar kamera' }, wallet: { en: 'Rialo Playground wallet', id: 'Dompet Rialo Playground' },
  zoom: { en: 'Zoom', id: 'Zoom' }, hideKeys: { en: 'Show / hide controls', id: 'Tampil / sembunyi kontrol' }, menu: { en: 'Menu', id: 'Menu' },
  badgeGot: { en: 'Badge earned', id: 'Badge didapat' },
  q1: { en: 'Visit Rialo HQ and talk to Eric Argent', id: 'Kunjungi Rialo HQ dan ngobrol dengan Eric Argent' },
  q2: { en: 'Learn from the 3 Rialo specialists', id: 'Belajar dari 3 spesialis Rialo' },
  q3: { en: 'Pass Eric\'s Rialo quiz', id: 'Lulus kuis Rialo dari Eric' },
  q4: { en: 'Beat Dikzzy in a holo-battle', id: 'Kalahkan Dikzzy di holo-battle' },
  q5: { en: 'Claim $RIALO at the Playground & spin the gacha', id: 'Klaim $RIALO di Playground & spin gacha' },
  quizOffer: { en: 'Take the Rialo quiz', id: 'Ikut kuis Rialo' },
  quizLocked: { en: 'You\'ve earned {n}/3 specialist badges. Talk to Ade, Koushik and Rollins, then come back for my quiz!',
    id: 'Kamu baru punya {n}/3 badge spesialis. Ngobrol dulu dengan Ade, Koushik, dan Rollins, lalu balik buat kuisku!' },
  quizIntro: { en: 'Five questions. Get at least 4 right to earn the Rialo Explorer certificate. Ready?',
    id: 'Lima pertanyaan. Benar minimal 4 untuk dapat sertifikat Rialo Explorer. Siap?' },
  quizPass: { en: 'Brilliant! {s}/5 — you\'re officially a Rialo Explorer. Get real, on Rialo!',
    id: 'Keren! {s}/5 — kamu resmi jadi Rialo Explorer. Get real, on Rialo!' },
  quizFail: { en: '{s}/5. Close! Chat with the specialists again and retry anytime.',
    id: '{s}/5. Hampir! Ngobrol lagi dengan para spesialis lalu coba lagi kapan saja.' },
  question: { en: 'QUESTION', id: 'PERTANYAAN' },
  ready: { en: 'Let\'s go!', id: 'Ayo!' }, notYet: { en: 'Not yet', id: 'Nanti dulu' },
  allTopics: { en: 'Thanks, that\'s all for now', id: 'Makasih, cukup dulu' },
  certTitle: { en: 'RIALO EXPLORER', id: 'RIALO EXPLORER' },
  certBody: { en: 'Certified on the streets of Semesta City', id: 'Tersertifikasi di jalanan Semesta City' },
  close: { en: 'Close', id: 'Tutup' },
  language: { en: 'Language', id: 'Bahasa' }, graphics: { en: 'Graphics', id: 'Grafis' },
  masterVol: { en: 'Master volume', id: 'Volume utama' }, musicVol: { en: 'Music', id: 'Musik' }, sfxVol: { en: 'Sound effects', id: 'Efek suara' },
  sens: { en: 'Mouse sensitivity', id: 'Sensitivitas mouse' }, invertY: { en: 'Invert Y', id: 'Balik sumbu Y' },
  low: { en: 'Low', id: 'Rendah' }, medium: { en: 'Medium', id: 'Sedang' }, high: { en: 'High', id: 'Tinggi' },
  on: { en: 'On', id: 'Aktif' }, off: { en: 'Off', id: 'Mati' },
  hqDoor: { en: 'The doors are locked tonight — the DevNet team is heads-down shipping. The Rialo crew is out front in the plaza.',
    id: 'Pintunya dikunci malam ini — tim DevNet lagi fokus ngoding. Kru Rialo ada di plaza depan.' },
  vending: { en: 'You buy a hot can of coffee. ¥130. Warm hands, happy heart.', id: 'Kamu beli kopi kaleng panas. ¥130. Tangan hangat, hati senang.' },
  notice: { en: 'NOTICE BOARD — "Rialo HQ: meet the team in the plaza tonight! · Robo-dori: holo-battles every rainy night · Semesta Mart open 24h"',
    id: 'PAPAN PENGUMUMAN — "Rialo HQ: temui tim di plaza malam ini! · Robo-dori: holo-battle setiap malam hujan · Semesta Mart buka 24 jam"' },
  atm: { en: 'The ATM screen reads: "Coming soon — log in with email, 2FA included." Interesting…', id: 'Layar ATM bertuliskan: "Segera hadir — login pakai email, sudah termasuk 2FA." Menarik…' },
  battleWin: { en: 'VICTORY!', id: 'MENANG!' },
};
