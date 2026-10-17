// Rialo Testnet SIMULATION for Semesta City. Purely local: no network calls, no real keys,
// no real tokens. Everything (identity, custodial wallet, balance, points, tx history) is
// persisted inside the `save` object that core passes in (save.chain = {...}); core calls
// saveGame() from the onChange callback.
//
//   const chain = createChain(save, { onChange(chain) { saveGame(save); } });
//   await chain.claimFaucet();               // 5 $RIALO, once per 24 h (first claim always open)
//   await chain.spend(1, 'gacha ×1');        // rejects with err.code === 'INSUFFICIENT_FUNDS'
//   await chain.reward(2, 'holo battle win');// quest rewards
//   chain.on('tx', (tx) => …) / chain.on('change', (chain) => …)  → returns an unsubscribe fn
//
// Tx = { sig, kind: 'faucet'|'spend'|'reward'|'refund', amount (always positive), dir: 'in'|'out',
//        memo, from, to, fee, slot, submitSlot, time, status: 'pending'|'confirmed', latencyMs }

export const NETWORK_NAME = 'Rialo Testnet (simulated)';
export const FAUCET_AMOUNT = 5;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const WELCOME_POINTS = 20;
export const POINTS = { faucet: 10, gachaPull: 5, reward: 5 };
const SLOTS_PER_SEC = 2.5;
const MAX_TXS = 60;

// Simulated program / system addresses (valid base58 strings, clearly fake).
export const ADDR = {
  faucet: 'RiaLoFaucet1111111111111111111111111111111',
  gacha: 'SemestaGacha111111111111111111111111111111',
  quests: 'SemestaQuest111111111111111111111111111111',
};

// ------------------------------------------------------------------ helpers
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function randomBytes(n) {
  const b = new Uint8Array(n);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = (Math.random() * 256) | 0;
  return b;
}

/** base58 (Bitcoin/Solana alphabet) encode of a byte array */
export function base58(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (const byte of bytes) { if (byte === 0) out += '1'; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

export function uuidv4() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function slug(name) {
  const s = String(name || 'player').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 24);
  return s || 'player';
}

const round2 = (x) => Math.round(x * 100) / 100;
export const shortSig = (s, a = 4, b = 4) => (s && s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const err = (code, message) => Object.assign(new Error(message), { code });

// ------------------------------------------------------------------ chain
export function createChain(save, { onChange } = {}) {
  if (!save || typeof save !== 'object') throw new Error('createChain(save): save object required');
  const now = Date.now();
  const c = save.chain && save.chain.v === 1 ? save.chain : (save.chain = {
    v: 1,
    userId: uuidv4(),
    publicKey: base58(randomBytes(32)),
    balance: 0,
    points: WELCOME_POINTS,
    joinedAt: now,
    lastClaim: null,           // ms timestamp of last faucet claim (null = never → claim open)
    claims: 0,
    genesisTime: now,          // slot clock origin (slot keeps advancing in real time across sessions)
    genesisSlot: 48_000_000 + Math.floor(Math.random() * 2_000_000),
    txs: [],
    pointsLog: [{ n: WELCOME_POINTS, reason: 'welcome bonus', time: now }],
  });
  // migrate / sanitize
  c.txs = Array.isArray(c.txs) ? c.txs : [];
  c.pointsLog = Array.isArray(c.pointsLog) ? c.pointsLog : [];
  c.balance = round2(Number(c.balance) || 0);
  c.points = Number(c.points) || 0;

  const listeners = { change: new Set(), tx: new Set() };
  const emit = (ev, arg) => { for (const fn of listeners[ev]) { try { fn(arg); } catch (e) { console.error(e); } } };
  const changed = () => { emit('change', chain); if (onChange) { try { onChange(chain); } catch (e) { console.error(e); } } };

  // finalize txs left pending by a reload (credits applied on confirm, debits on submit)
  for (const tx of c.txs) {
    if (tx.status === 'pending') {
      if (tx.dir === 'in' && !tx.applied) { c.balance = round2(c.balance + tx.amount); tx.applied = true; }
      tx.status = 'confirmed'; tx.latencyMs = tx.latencyMs || 640; tx.slot = tx.slot || tx.submitSlot;
    }
  }

  let jitter = 0, tps = 2400 + Math.random() * 1200, lastSlot = 0;
  const slotNow = () => (lastSlot = Math.max(lastSlot, c.genesisSlot,
    Math.floor(c.genesisSlot + ((Date.now() - c.genesisTime) / 1000) * SLOTS_PER_SEC + jitter)));

  function newTx(kind, dir, amount, memo, from, to) {
    const tx = {
      sig: base58(randomBytes(64)), kind, dir, amount: round2(amount), memo: memo || '',
      from, to, fee: 0, submitSlot: slotNow(), slot: null, time: Date.now(),
      status: 'pending', latencyMs: null, applied: false,
    };
    c.txs.unshift(tx);
    if (c.txs.length > MAX_TXS) c.txs.length = MAX_TXS;
    emit('tx', tx); changed();
    return tx;
  }

  async function confirm(tx) {
    const latency = Math.round(380 + Math.random() * 520);
    await sleep(latency);
    if (tx.dir === 'in' && !tx.applied) { c.balance = round2(c.balance + tx.amount); tx.applied = true; }
    tx.status = 'confirmed';
    tx.latencyMs = latency;
    tx.slot = Math.max(tx.submitSlot + 1, slotNow());
    emit('tx', tx); changed();
    return { ...tx };
  }

  function addPoints(n, reason = '') {
    n = Math.round(Number(n) || 0);
    if (!n) return c.points;
    c.points += n;
    c.pointsLog.unshift({ n, reason, time: Date.now() });
    if (c.pointsLog.length > 40) c.pointsLog.length = 40;
    changed();
    return c.points;
  }

  const faucet = {
    amount: FAUCET_AMOUNT,
    cooldownMs: FAUCET_COOLDOWN_MS,
    canClaim: () => c.lastClaim == null || Date.now() - c.lastClaim >= FAUCET_COOLDOWN_MS,
    nextClaimAt: () => (c.lastClaim == null ? Date.now() : c.lastClaim + FAUCET_COOLDOWN_MS),
    remainingMs: () => Math.max(0, faucet.nextClaimAt() - Date.now()),
  };

  const chain = {
    network: NETWORK_NAME,
    simulated: true,
    get identity() {
      const name = save.appearance?.name || 'Player';
      return { email: `${slug(name)}@semesta.city`, userId: c.userId, name };
    },
    wallet: {
      get publicKey() { return c.publicKey; },
      get balance() { return c.balance; },
    },
    get slot() { return slotNow(); },
    get tps() { return Math.round(tps); },
    get points() { return c.points; },
    get txs() { return c.txs; },
    get pointsLog() { return c.pointsLog; },
    get joinedAt() { return c.joinedAt; },
    get claims() { return c.claims; },
    faucet,

    /** daily faucet: 5 $RIALO. Rejects with code 'COOLDOWN' while on cooldown. */
    async claimFaucet() {
      if (!faucet.canClaim()) throw err('COOLDOWN', 'Faucet on cooldown');
      c.lastClaim = Date.now();
      c.claims++;
      const tx = newTx('faucet', 'in', FAUCET_AMOUNT, 'faucet airdrop', ADDR.faucet, c.publicKey);
      const done = await confirm(tx);
      addPoints(POINTS.faucet, 'faucet claim');
      return done;
    },

    /** debit (e.g. gacha). Rejects with code 'INSUFFICIENT_FUNDS' (balance untouched). */
    async spend(amount, memo = '', { to = ADDR.gacha } = {}) {
      amount = round2(Number(amount));
      if (!(amount > 0)) throw err('BAD_AMOUNT', 'Amount must be positive');
      if (c.balance + 1e-9 < amount) throw err('INSUFFICIENT_FUNDS', `Insufficient funds: have ${c.balance}, need ${amount}`);
      c.balance = round2(c.balance - amount);   // debit on submit so concurrent spends can't overdraw
      const tx = newTx('spend', 'out', amount, memo, c.publicKey, to);
      tx.applied = true;
      return confirm(tx);
    },

    /** credit for quests / refunds. opts.kind = 'reward' (default) | 'refund'; opts.points overrides points */
    async reward(amount, memo = '', { kind, points } = {}) {
      amount = round2(Number(amount));
      if (!(amount > 0)) throw err('BAD_AMOUNT', 'Amount must be positive');
      const k = kind || (/refund/i.test(memo) ? 'refund' : 'reward');
      const tx = newTx(k, 'in', amount, memo, k === 'refund' ? ADDR.gacha : ADDR.quests, c.publicKey);
      const done = await confirm(tx);
      const p = points ?? (k === 'reward' ? POINTS.reward : 0);
      if (p) addPoints(p, memo || 'quest reward');
      return done;
    },

    addPoints,

    /** advance the (time-based) slot clock's jitter + tps wobble; cheap, call every frame */
    update(dt = 0.016) {
      jitter = Math.max(-1.5, Math.min(1.5, jitter + (Math.random() - 0.5) * dt * 2));
      tps += (2800 + Math.sin(Date.now() / 7000) * 900 - tps) * Math.min(1, dt * 0.8) + (Math.random() - 0.5) * 60;
    },

    on(ev, fn) { listeners[ev]?.add(fn); return () => listeners[ev]?.delete(fn); },
    off(ev, fn) { listeners[ev]?.delete(fn); },
    /** fire change/onChange (e.g. after the gacha UI edits save.inventory / save.equipped) */
    emitChange: changed,

    /** test helpers */
    _debug: {
      expireCooldown() { if (c.lastClaim != null) c.lastClaim = Date.now() - FAUCET_COOLDOWN_MS - 1; changed(); },
      setBalance(b) { c.balance = round2(b); changed(); },
    },
  };
  return chain;
}
