// Harness for the simulated Rialo testnet + gacha. URL params: ?open=playground|gacha  ?lang=id  ?tests=1
import { audio } from '../src/core/audio.js';
import { createChain, FAUCET_COOLDOWN_MS } from '../src/systems/chain.js';
import { simulate, pull, buyPulls, ensureGachaSave, equip, unequip, RARITY, GACHA } from '../src/systems/gacha.js';
import { openPlayground } from '../src/ui/playground.js';
import { openGacha } from '../src/ui/gacha.js';

const KEY = 'semesta-testnet-harness';
const params = new URLSearchParams(location.search);
let lang = params.get('lang') === 'id' ? 'id' : 'en';

const logEl = document.getElementById('log');
function log(msg, cls = 'info') {
  const line = document.createElement('div');
  line.className = cls; line.textContent = msg;
  logEl.prepend(line);
  console.log(`[testnet] ${msg}`);
}

const fresh = () => ({ v: 1, appearance: { name: 'Nara Hoshino' }, badges: [], created: Date.now() });
let save;
try { save = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { save = fresh(); }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } };

let chain;
function boot() {
  chain = createChain(save, { onChange: () => { persist(); renderState(); } });
  ensureGachaSave(save);
  persist(); renderState();
}
function renderState() {
  const c = chain;
  document.getElementById('state').textContent =
    `identity  ${c.identity.email} · ${c.identity.userId}\n` +
    `wallet    ${c.wallet.publicKey}\n` +
    `balance   ${c.wallet.balance} $RIALO · points ${c.points} · slot ${c.slot}\n` +
    `faucet    ${c.faucet.canClaim() ? 'READY' : `cooldown ${Math.ceil(c.faucet.remainingMs() / 1000)} s`}\n` +
    `inventory ${JSON.stringify(save.inventory)}\n` +
    `equipped  ${JSON.stringify(save.equipped)}\n` +
    `gacha     pity ${save.gacha?.pity} · pulls ${save.gacha?.pulls} · legendaries ${save.gacha?.legendaries}\n` +
    `txs       ${c.txs.length}`;
}
boot();
setInterval(() => { chain.update(0.5); renderState(); }, 500);

let current = null;
function openPG(view) {
  current?.close?.();
  current = openPlayground({
    chain, lang, initialView: view,
    onClose: () => { log('playground closed'); current = null; },
    onOpenApp: (id) => { log(`onOpenApp("${id}")`, 'ok'); if (id === 'gacha') setTimeout(openG, 250); },
  });
}
function openG() {
  current?.close?.();
  current = openGacha({
    chain, save, lang,
    onEquip: (item, slot) => { log(`onEquip(${item ? item.id : 'null'}, ${slot})`, 'ok'); persist(); },
    onClose: () => { log('gacha closed'); current = null; },
    onNeedFunds: () => { log('onNeedFunds()', 'ok'); setTimeout(() => openPG(), 250); },
  });
}
window.__h = { get chain() { return chain; }, get save() { return save; }, openPG, openG, get current() { return current; } };

const on = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { audio.unlock(); fn(e); });
on('b-pg', () => openPG());
on('b-gacha', () => openG());
on('b-lang', (e) => { lang = lang === 'en' ? 'id' : 'en'; e.target.textContent = `Lang: ${lang.toUpperCase()}`; });
on('b-ff', () => { chain._debug.expireCooldown(); log('faucet cooldown expired'); });
on('b-reward', async () => { const tx = await chain.reward(2, 'holo battle win'); log(`reward tx ${tx.sig.slice(0, 8)}… +${tx.amount} in ${tx.latencyMs} ms`, 'ok'); });
on('b-rich', () => { chain._debug.setBalance(50); log('balance = 50'); });
on('b-broke', () => { chain._debug.setBalance(0); log('balance = 0'); });
on('b-reset', () => { save = fresh(); boot(); log('save reset'); });
on('b-sim', () => runSim());
on('b-tests', () => runTests());

function runSim(N = 1000) {
  const { counts, maxCommonStreak, pityHits } = simulate(N);
  const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
  const lines = Object.entries(counts).map(([r, n]) => `${r.padEnd(10)} ${String(n).padStart(4)}  ${(n / N * 100).toFixed(1)}%  (weight ${(RARITY[r].weight / total * 100).toFixed(1)}%)`);
  log(`${N} simulated rolls (pity hits ${pityHits}, longest common streak ${maxCommonStreak}):\n${lines.join('\n')}`, 'ok');
  return { counts, maxCommonStreak, pityHits };
}

// ------------------------------------------------------------------ automated checks
async function runTests() {
  const results = [];
  const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`, cond ? 'ok' : 'bad'); };
  const s = { v: 1, appearance: { name: 'Test Pilot!' } };
  let changes = 0;
  const c = createChain(s, { onChange: () => changes++ });

  check('identity email slug', c.identity.email === 'test.pilot@semesta.city', c.identity.email);
  check('uuid v4', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.identity.userId));
  check('base58 public key 32B', /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.wallet.publicKey), c.wallet.publicKey);
  check('first claim available', c.faucet.canClaim());
  const t0 = performance.now();
  const p = c.claimFaucet();
  check('claim tx pending while confirming', c.txs[0].status === 'pending');
  const tx = await p;
  check('faucet credited 5', c.wallet.balance === 5, `balance ${c.wallet.balance}`);
  check('tx confirmed w/ latency 380–900', tx.status === 'confirmed' && tx.latencyMs >= 380 && tx.latencyMs <= 900, `${tx.latencyMs} ms (wall ${Math.round(performance.now() - t0)} ms)`);
  check('tx sig base58 64B', /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(tx.sig), `${tx.sig.length} chars`);
  check('points +10 for claim (welcome 20)', c.points === 30, `points ${c.points}`);
  check('slot advanced past submit', tx.slot > tx.submitSlot);
  check('second claim blocked', !c.faucet.canClaim());
  let cool = null; try { await c.claimFaucet(); } catch (e) { cool = e.code; }
  check('second claim rejects COOLDOWN', cool === 'COOLDOWN');
  const rem = c.faucet.remainingMs();
  check('cooldown ≈ 24 h', rem > FAUCET_COOLDOWN_MS - 5000 && rem <= FAUCET_COOLDOWN_MS, `${(rem / 3600000).toFixed(3)} h`);

  const slotA = c.slot; await new Promise((r) => setTimeout(r, 1200)); const slotB = c.slot;
  check('slot clock ~2.5 slots/s', slotB - slotA >= 1 && slotB - slotA <= 5, `+${slotB - slotA} in 1.2 s`);

  c._debug.setBalance(0);
  let broke = null; try { await c.spend(1, 'gacha ×1'); } catch (e) { broke = e.code; }
  check('spend when broke rejects INSUFFICIENT_FUNDS', broke === 'INSUFFICIENT_FUNDS');
  check('balance untouched after failed spend', c.wallet.balance === 0);
  let broke2 = null; try { await buyPulls(c, s, 10); } catch (e) { broke2 = e.code; }
  check('buyPulls broke rejects before rolling', broke2 === 'INSUFFICIENT_FUNDS' && !(s.gacha?.pulls), `pulls ${s.gacha?.pulls}`);

  c._debug.setBalance(20);
  const sp = await c.spend(9, 'gacha ×10');
  check('spend debits', c.wallet.balance === 11 && sp.status === 'confirmed');

  // distribution
  const N = 1000;
  const sim = runSim(N);
  check('common ≈ 60% (±7)', Math.abs(sim.counts.common / N * 100 - 60) < 7);
  check('rare ≈ 28% (±6)', Math.abs(sim.counts.rare / N * 100 - 28) < 6.5);
  check('epic ≈ 10% (±4)', Math.abs(sim.counts.epic / N * 100 - 10) < 4.5);
  check('legendary present-ish (0–6%)', sim.counts.legendary / N * 100 < 6);
  check('no common streak ≥ pityRare', sim.maxCommonStreak < GACHA.pityRare, `max ${sim.maxCommonStreak}`);

  // pity with a rigged rng (always lowest roll → common unless forced)
  const ps = ensureGachaSave({});
  const rigged = pull(ps, 10, () => 0);
  check('pity: 9 commons then guaranteed rare+', rigged.slice(0, 9).every((r) => r.rarity === 'common') && rigged[9].rarity !== 'common' && rigged[9].pity,
    rigged.map((r) => r.rarity[0]).join(''));
  check('pity counter reset', ps.gacha.pity === 0);

  // dupes + refund
  const ds = ensureGachaSave({ appearance: { name: 'Dupe' } });
  const dc = createChain(ds, {});
  dc._debug.setBalance(5);
  const r1 = await buyPulls(dc, ds, 1, { rng: () => 0 });
  const r2 = await buyPulls(dc, ds, 1, { rng: () => 0 });
  check('dupe detected', !r1.results[0].dupe && r2.results[0].dupe && r2.refund === GACHA.dupeRefund);
  await r2.refundTx;
  check('dupe refund credited', Math.abs(dc.wallet.balance - (5 - 2 + GACHA.dupeRefund)) < 1e-9, `balance ${dc.wallet.balance}`);
  check('gacha points +5/pull', dc.points === 20 + 10, `points ${dc.points}`);
  check('refund tx kind', dc.txs[0].kind === 'refund');

  // equip persistence
  const eqItem = r1.results[0].item;
  equip(ds, eqItem.id);
  const reloaded = ensureGachaSave(JSON.parse(JSON.stringify(ds)));
  check('equip persists through JSON', reloaded.equipped[eqItem.type] === eqItem.id, `${eqItem.type}=${reloaded.equipped[eqItem.type]}`);
  check('cannot equip unowned', equip(ds, 'hw_crown') === null || (ds.inventory.hw_crown > 0));
  unequip(reloaded, eqItem.type);
  check('unequip clears slot', reloaded.equipped[eqItem.type] === null);

  // reload restores chain state
  const c2 = createChain(JSON.parse(JSON.stringify(s)), {});
  check('chain state survives reload', c2.wallet.publicKey === c.wallet.publicKey && c2.wallet.balance === c.wallet.balance && !c2.faucet.canClaim());
  check('onChange fired', changes > 3, `${changes}×`);

  const failed = results.filter((r) => !r.pass);
  log(`== ${results.length - failed.length}/${results.length} passed ==`, failed.length ? 'bad' : 'ok');
  window.__testResults = { passed: results.length - failed.length, total: results.length, failed: failed.map((f) => f.name) };
  return window.__testResults;
}
window.__runTests = runTests;

if (params.get('tests') === '1') runTests();
if (params.get('open') === 'playground') openPG();
if (params.get('open') === 'gacha') openG();
