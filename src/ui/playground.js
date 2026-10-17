// "Rialo Playground" overlay — an in-game, SIMULATED echo of playground.rialo.io's account page
// (identity, custodial wallet + faucet, points, activity / mini explorer, app catalog).
// Nothing here touches the network; it only drives the local chain sim (src/systems/chain.js).
//
//   const pg = openPlayground({ chain, lang, onClose, onOpenApp(appId) });  pg.close();
//   appId: 'gacha' | 'battle' | 'academy'. Launching an app closes the overlay (onClose) first,
//   then calls onOpenApp(appId).
import './playground.css';
import { rialoMarkDataURL } from '../gfx/rialoLogo.js';
import { audio } from '../core/audio.js';
import { settings } from '../core/state.js';
import { shortSig, POINTS, FAUCET_AMOUNT } from '../systems/chain.js';

// ------------------------------------------------------------------ shared overlay helpers
// One capture-phase window listener for every open overlay; only the top-most overlay gets keys.
// keydown never reaches the game (input.js listens on window in the bubble phase); keyup is let
// through so keys held while opening are released properly.
const stack = [];
function onKeyCapture(e) {
  const top = stack[stack.length - 1];
  if (!top) return;
  e.stopImmediatePropagation();
  if (e.code === 'Escape') { e.preventDefault(); top.onEscape?.(); return; }
  top.onKey?.(e);
}
export function trapGameInput(root, { onEscape, onKey } = {}) {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
  const entry = { root, onEscape, onKey };
  if (!stack.length) addEventListener('keydown', onKeyCapture, true);
  stack.push(entry);
  const stopWheel = (e) => e.stopPropagation();
  root.addEventListener('wheel', stopWheel, { passive: true });
  root.addEventListener('contextmenu', (e) => e.stopPropagation());
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) removeEventListener('keydown', onKeyCapture, true);
    root.removeEventListener('wheel', stopWheel);
  };
}

export const sfx = (name, o) => { try { audio.sfx(name, o); } catch { /* audio optional */ } };
export const fmtNum = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const fmtSecs = (ms) => `${(ms / 1000).toFixed(2)} s`;
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = (x) => String(x).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

// ------------------------------------------------------------------ strings
const S = {
  title: { en: 'Rialo Playground', id: 'Rialo Playground' },
  net: { en: 'TESTNET · simulated', id: 'TESTNET · simulasi' },
  slot: { en: 'SLOT', id: 'SLOT' },
  tps: { en: 'TPS', id: 'TPS' },
  close: { en: 'Close', id: 'Tutup' },
  tabAccount: { en: 'Account & faucet', id: 'Akun & faucet' },
  tabApps: { en: 'Browse apps', id: 'Jelajahi app' },
  simNote: {
    en: 'Simulated Rialo testnet inside Semesta City. Keys, $RIALO, points and transactions exist only in your save file. No real network, no real tokens.',
    id: 'Testnet Rialo simulasi di dalam Semesta City. Kunci, $RIALO, poin dan transaksi hanya ada di file save kamu. Bukan jaringan asli, bukan token asli.',
  },
  fundFirst: { en: 'Fund your wallet first: claim free test $RIALO from the faucet below.', id: 'Isi dompetmu dulu: klaim $RIALO tes gratis dari faucet di bawah.' },
  identity: { en: 'Identity', id: 'Identitas' },
  email: { en: 'EMAIL', id: 'EMAIL' },
  userId: { en: 'USER ID', id: 'USER ID' },
  name: { en: 'NAME', id: 'NAMA' },
  wallet: { en: 'Custodial wallet', id: 'Dompet kustodian' },
  pubkey: { en: 'PUBLIC KEY', id: 'PUBLIC KEY' },
  balance: { en: 'BALANCE', id: 'SALDO' },
  network: { en: 'NETWORK', id: 'JARINGAN' },
  keyNote: { en: 'Keypair generated and encrypted server-side (simulated)', id: 'Keypair dibuat dan dienkripsi di server (simulasi)' },
  copy: { en: 'Copy address', id: 'Salin alamat' },
  copied: { en: 'Copied ✓', id: 'Tersalin ✓' },
  request: { en: 'Request $RIALO', id: 'Minta $RIALO' },
  requesting: { en: 'Requesting…', id: 'Meminta…' },
  nextClaim: { en: 'Next claim in {t}', id: 'Klaim berikutnya {t}' },
  faucetInfo: { en: 'Faucet: {a} $RIALO every 24 h · first claim always open', id: 'Faucet: {a} $RIALO tiap 24 jam · klaim pertama selalu terbuka' },
  faucetReady: { en: 'Faucet ready: {a} $RIALO waiting for you', id: 'Faucet siap: {a} $RIALO menunggumu' },
  browse: { en: 'Browse apps →', id: 'Jelajahi app →' },
  points: { en: 'Join with this wallet', id: 'Gabung dengan dompet ini' },
  pointsSub: { en: 'One points balance across every app in the Playground.', id: 'Satu saldo poin untuk semua app di Playground.' },
  pts: { en: 'points', id: 'poin' },
  joined: { en: 'Joined on', id: 'Bergabung' },
  linked: { en: 'Linked · Semesta City', id: 'Tertaut · Semesta City' },
  earn: { en: 'HOW TO EARN', id: 'CARA DAPAT' },
  earnFaucet: { en: 'Faucet claim', id: 'Klaim faucet' },
  earnPull: { en: 'Gacha pull', id: 'Tarik gacha' },
  earnQuest: { en: 'Quest reward (badge, battle win, quiz)', id: 'Hadiah misi (badge, menang battle, kuis)' },
  recentPts: { en: 'RECENT', id: 'TERBARU' },
  activity: { en: 'Recent transactions', id: 'Transaksi terbaru' },
  noTx: { en: 'No transactions yet. Request $RIALO to sign your first one.', id: 'Belum ada transaksi. Minta $RIALO untuk tanda tangan transaksi pertamamu.' },
  colSig: { en: 'SIGNATURE', id: 'SIGNATURE' }, colKind: { en: 'TYPE', id: 'TIPE' }, colAmt: { en: 'AMOUNT', id: 'JUMLAH' },
  colSlot: { en: 'SLOT', id: 'SLOT' }, colLat: { en: 'LATENCY', id: 'LATENSI' }, colStatus: { en: 'STATUS', id: 'STATUS' },
  pending: { en: 'pending', id: 'pending' }, confirmed: { en: 'confirmed', id: 'konfirmasi' },
  k_faucet: { en: 'Faucet', id: 'Faucet' }, k_spend: { en: 'Spend', id: 'Belanja' }, k_reward: { en: 'Reward', id: 'Hadiah' }, k_refund: { en: 'Refund', id: 'Refund' },
  toastClaim: { en: 'Airdrop confirmed · +{a} $RIALO', id: 'Airdrop terkonfirmasi · +{a} $RIALO' },
  toastSub: { en: 'confirmed in {s} · slot {slot} · sig {sig}', id: 'terkonfirmasi dalam {s} · slot {slot} · sig {sig}' },
  toastCool: { en: 'Faucet is cooling down: next claim in {t}', id: 'Faucet sedang cooldown: klaim berikutnya {t}' },
  view: { en: 'View', id: 'Lihat' },
  tx: { en: 'Transaction', id: 'Transaksi' },
  explorerNote: { en: 'Simulated explorer view. This transaction exists only in your Semesta City save.', id: 'Tampilan explorer simulasi. Transaksi ini hanya ada di save Semesta City kamu.' },
  d_sig: { en: 'Signature', id: 'Signature' }, d_status: { en: 'Status', id: 'Status' }, d_slot: { en: 'Slot', id: 'Slot' },
  d_submit: { en: 'Submitted at slot', id: 'Dikirim di slot' }, d_lat: { en: 'Confirmation time', id: 'Waktu konfirmasi' },
  d_time: { en: 'Timestamp', id: 'Waktu' }, d_kind: { en: 'Type', id: 'Tipe' }, d_from: { en: 'From', id: 'Dari' }, d_to: { en: 'To', id: 'Ke' },
  d_amt: { en: 'Amount', id: 'Jumlah' }, d_fee: { en: 'Fee', id: 'Biaya' }, d_memo: { en: 'Memo', id: 'Memo' }, d_net: { en: 'Network', id: 'Jaringan' },
  feeVal: { en: '0 $RIALO (gasless · simulated)', id: '0 $RIALO (tanpa gas · simulasi)' },
  apps: { en: 'App Catalog', id: 'Katalog App' },
  appsSub: { en: 'Built on Rialo (in Semesta City). Your custodial wallet carries over to every app.', id: 'Dibangun di Rialo (di Semesta City). Dompet kustodianmu terbawa ke semua app.' },
  launch: { en: 'Launch app →', id: 'Buka app →' },
  back: { en: '← Account & faucet', id: '← Akun & faucet' },
  where: { en: 'WHERE', id: 'LOKASI' },
};

const APPS = [
  { id: 'gacha', glyph: '◎', color: '#ffcf4a', tag: { en: 'COLLECTIBLES', id: 'KOLEKSI' }, name: 'Semesta Gacha',
    desc: { en: 'Spend $RIALO on capsule-toy cosmetics: headwear, auras, umbrellas and titles. Duplicates refund 0.2 $RIALO.', id: 'Pakai $RIALO untuk kosmetik kapsul: topi, aura, payung dan gelar. Duplikat dapat refund 0,2 $RIALO.' },
    where: { en: 'Gacha machine · Robo-dori / Semesta Mart', id: 'Mesin gacha · Robo-dori / Semesta Mart' } },
  { id: 'battle', glyph: '⬡', color: '#5ee7ff', tag: { en: 'GAMES', id: 'GAME' }, name: 'Holo Battle',
    desc: { en: 'Challenge Dikzzy to a holographic robot duel at the holo-table. Each win pays +2 $RIALO.', id: 'Tantang Dikzzy duel robot hologram di holo-table. Tiap menang dapat +2 $RIALO.' },
    where: { en: 'Dikzzy · holo-table, Robo-dori', id: 'Dikzzy · holo-table, Robo-dori' } },
  { id: 'academy', glyph: '✦', color: '#a8e0d6', tag: { en: 'LEARN', id: 'BELAJAR' }, name: 'Rialo Academy',
    desc: { en: 'Learn how Rialo works from Eric Argent and the crew. Badges pay +1 $RIALO, passing the quiz +3 $RIALO.', id: 'Pelajari cara kerja Rialo dari Eric Argent dan kru. Badge +1 $RIALO, lulus kuis +3 $RIALO.' },
    where: { en: 'Eric Argent · front of Rialo HQ', id: 'Eric Argent · depan Rialo HQ' } },
];

let markURL = null;
const mark = () => (markURL ||= rialoMarkDataURL(64, { bg: null, fg: '#e8e3d5' }));

// ------------------------------------------------------------------ overlay
export function openPlayground({ chain, lang, onClose, onOpenApp, initialView = 'account' } = {}) {
  if (!chain) throw new Error('openPlayground: chain required');
  const L = lang || settings.lang || 'en';
  const tr = (k, vars) => {
    const s = typeof k === 'string' ? S[k] : k;
    let out = s && typeof s === 'object' ? (s[L] ?? s.en) : String(s ?? '');
    if (vars) out = out.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
    return out;
  };
  const sec = (n, label) => `<span class="rpg-sec"><span class="n">§ ${n} /</span> <span class="l">${label}</span></span>`;

  const root = document.createElement('div');
  root.className = 'rpg';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', tr('title'));
  root.innerHTML = `
  <div class="rpg-bg"></div>
  <header class="rpg-top">
    <div class="rpg-brand"><img alt="Rialo" src="${mark()}"><span>${tr('title')}</span></div>
    <span class="rpg-net"><i></i>${tr('net')}</span>
    <nav class="rpg-tabs">
      <button data-view="account">${tr('tabAccount')}</button>
      <button data-view="apps">${tr('tabApps')}</button>
    </nav>
    <div class="rpg-sp"></div>
    <div class="rpg-stat"><span>${tr('slot')}</span><b data-f="slot">0</b></div>
    <div class="rpg-stat rpg-hide-md"><span>${tr('tps')}</span><b data-f="tps">0</b></div>
    <button class="rpg-x" data-act="close" title="${tr('close')} (Esc)">✕<small>Esc</small></button>
  </header>
  <main class="rpg-scroll"><div class="rpg-col">
    <section data-pane="account">
      <p class="rpg-sim">${tr('simNote')}</p>
      <p class="rpg-fund" data-f="fund">${tr('fundFirst')}</p>
      <article class="rpg-card">
        <header>${sec('01', 'SESSION')}<h2>${tr('identity')}</h2></header>
        <div class="rpg-body">
          <div class="rpg-row"><span class="k">${tr('email')}</span><span class="v" data-f="email"></span></div>
          <div class="rpg-row"><span class="k">${tr('userId')}</span><span class="v mono" data-f="uid"></span></div>
          <div class="rpg-row"><span class="k">${tr('name')}</span><span class="v" data-f="name"></span></div>
        </div>
      </article>
      <article class="rpg-card">
        <header>${sec('02', 'KEYPAIR')}<h2>${tr('wallet')}</h2></header>
        <div class="rpg-body">
          <div class="rpg-row"><span class="k">${tr('pubkey')}</span><span class="v mono rpg-key"><span data-f="pk"></span>
            <button class="rpg-copy" data-act="copy" title="${tr('copy')}">⧉ <span data-f="copyLbl">${tr('copy')}</span></button></span></div>
          <div class="rpg-row"><span class="k">${tr('balance')}</span><span class="v rpg-bal"><b data-f="bal">0</b> $RIALO</span></div>
          <div class="rpg-row"><span class="k">${tr('network')}</span><span class="v mono dim">${esc(chain.network)}</span></div>
          <p class="rpg-note">${tr('keyNote')}</p>
          <div class="rpg-hr"></div>
          <div class="rpg-actions">
            <button class="rpg-btn mint" data-act="claim"><span data-f="claimLbl">${tr('request')}</span></button>
            <button class="rpg-btn ghost" data-act="apps">${tr('browse')}</button>
            <span class="rpg-faucet" data-f="faucet"></span>
          </div>
        </div>
      </article>
      <article class="rpg-card">
        <header>${sec('03', 'POINTS')}<h2>${tr('points')}</h2></header>
        <div class="rpg-body">
          <p class="rpg-note top">${tr('pointsSub')}</p>
          <div class="rpg-pts">
            <div><b data-f="pts">0</b> <span>${tr('pts')}</span></div>
            <span class="rpg-chip ok">● ${tr('linked')}</span>
          </div>
          <div class="rpg-row"><span class="k">${tr('joined').toUpperCase()}</span><span class="v" data-f="joined"></span></div>
          <div class="rpg-earn">
            <div><span class="k">${tr('earn')}</span>
              <ul>
                <li><span>${tr('earnFaucet')}</span><b>+${POINTS.faucet}</b></li>
                <li><span>${tr('earnPull')}</span><b>+${POINTS.gachaPull}</b></li>
                <li><span>${tr('earnQuest')}</span><b>+${POINTS.reward}</b></li>
              </ul></div>
            <div><span class="k">${tr('recentPts')}</span><ul data-f="ptlog"></ul></div>
          </div>
        </div>
      </article>
      <article class="rpg-card">
        <header>${sec('04', 'ACTIVITY')}<h2>${tr('activity')}</h2></header>
        <div class="rpg-body flush">
          <div class="rpg-txhead"><span>${tr('colSig')}</span><span>${tr('colKind')}</span><span class="r">${tr('colAmt')}</span>
            <span class="r rpg-hide-sm">${tr('colSlot')}</span><span class="r rpg-hide-sm">${tr('colLat')}</span><span class="r">${tr('colStatus')}</span></div>
          <div class="rpg-txs" data-f="txs"></div>
        </div>
      </article>
    </section>
    <section data-pane="apps">
      <button class="rpg-back" data-view="account">${tr('back')}</button>
      <article class="rpg-card">
        <header>${sec('05', 'APPS')}<h2>${tr('apps')}</h2></header>
        <div class="rpg-body">
          <p class="rpg-note top">${tr('appsSub')}</p>
          <div class="rpg-apps">${APPS.map((a) => `
            <div class="rpg-app" style="--ac:${a.color}">
              <div class="ico">${a.glyph}</div>
              <div class="meta"><span class="tag">${tr(a.tag)}</span><h3>${a.name}</h3><p>${tr(a.desc)}</p>
                <p class="where"><span>${tr('where')}</span> ${tr(a.where)}</p></div>
              <button class="rpg-btn mint" data-app="${a.id}">${tr('launch')}</button>
            </div>`).join('')}
          </div>
        </div>
      </article>
    </section>
  </div></main>
  <aside class="rpg-drawer" data-f="drawer"></aside>
  <div class="rpg-toasts" data-f="toasts"></div>`;
  document.body.appendChild(root);
  const $ = (f) => root.querySelector(`[data-f="${f}"]`);

  let closed = false;
  const untrap = trapGameInput(root, {
    onEscape: () => (root.querySelector('.rpg-drawer.open') ? closeDrawer() : close()),
  });

  // ---------------------------------------------------------------- views
  function setView(v) {
    for (const p of root.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== v;
    for (const b of root.querySelectorAll('.rpg-tabs [data-view]')) b.classList.toggle('on', b.dataset.view === v);
    root.querySelector('.rpg-scroll').scrollTop = 0;
  }
  setView(initialView === 'apps' ? 'apps' : 'account');

  // ---------------------------------------------------------------- static-ish fields
  function renderIdentity() {
    const id = chain.identity;
    $('email').textContent = id.email;
    $('uid').textContent = id.userId;
    $('name').textContent = id.name;
    $('pk').textContent = chain.wallet.publicKey;
    $('joined').textContent = new Date(chain.joinedAt).toLocaleDateString(L === 'id' ? 'id-ID' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  renderIdentity();

  // animated balance counter
  let shownBal = chain.wallet.balance, balAnim = null;
  $('bal').textContent = fmtNum(shownBal);
  function animateBalance() {
    const target = chain.wallet.balance;
    if (Math.abs(target - shownBal) < 0.001) return;
    cancelAnimationFrame(balAnim);
    const from = shownBal, t0 = performance.now(), dur = 750;
    const el = $('bal');
    el.classList.remove('up', 'down'); void el.offsetWidth;
    el.classList.add(target > from ? 'up' : 'down');
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      shownBal = from + (target - from) * e;
      el.textContent = fmtNum(shownBal);
      if (k < 1) balAnim = requestAnimationFrame(step); else { shownBal = target; el.textContent = fmtNum(target); }
    };
    balAnim = requestAnimationFrame(step);
  }

  function renderPoints() {
    $('pts').textContent = fmtNum(chain.points, 0);
    $('ptlog').innerHTML = chain.pointsLog.slice(0, 4).map((p) => `<li><span>${esc(p.reason)}</span><b>+${p.n}</b></li>`).join('');
  }

  // ---------------------------------------------------------------- activity
  const kindLabel = (k) => tr(`k_${k}`) || k;
  function txRow(tx) {
    const sign = tx.dir === 'in' ? '+' : '−';
    return `<button class="rpg-tx ${tx.status}" data-sig="${tx.sig}">
      <span class="mono sig">${shortSig(tx.sig, 6, 6)}</span>
      <span class="kind k-${tx.kind}">${kindLabel(tx.kind)}<small>${esc(tx.memo)}</small></span>
      <span class="r mono amt ${tx.dir}">${sign}${fmtNum(tx.amount)}</span>
      <span class="r mono rpg-hide-sm">${tx.slot ? fmtNum(tx.slot, 0) : '—'}</span>
      <span class="r mono rpg-hide-sm">${tx.latencyMs ? `${tx.latencyMs} ms` : '…'}</span>
      <span class="r"><span class="rpg-chip ${tx.status === 'confirmed' ? 'ok' : 'wait'}">${tr(tx.status)}</span></span>
    </button>`;
  }
  function renderTxs() {
    const txs = chain.txs.slice(0, 25);
    $('txs').innerHTML = txs.length ? txs.map(txRow).join('') : `<p class="rpg-empty">${tr('noTx')}</p>`;
    const open = root.querySelector('.rpg-drawer.open');
    if (open && openSig) renderDrawer(openSig);
  }

  // ---------------------------------------------------------------- explorer drawer
  let openSig = null;
  function renderDrawer(sig) {
    const tx = chain.txs.find((x) => x.sig === sig);
    if (!tx) return;
    const d = $('drawer');
    const row = (k, v, cls = '') => `<div class="rpg-drow"><span class="k">${tr(k)}</span><span class="v ${cls}">${v}</span></div>`;
    d.innerHTML = `
      <header><div>${sec('TX', 'EXPLORER')}<h2>${tr('tx')}</h2></div><button class="rpg-x" data-act="drawer-close">✕</button></header>
      <div class="rpg-dbody">
        <div class="rpg-dsig mono">${tx.sig}</div>
        <button class="rpg-copy" data-act="copy-sig" data-sig="${tx.sig}">⧉ <span>${tr('copy').replace(/address|alamat/i, 'signature')}</span></button>
        ${row('d_status', `<span class="rpg-chip ${tx.status === 'confirmed' ? 'ok' : 'wait'}">${tr(tx.status)}</span>`)}
        ${row('d_slot', tx.slot ? fmtNum(tx.slot, 0) : '—', 'mono')}
        ${row('d_submit', fmtNum(tx.submitSlot, 0), 'mono')}
        ${row('d_lat', tx.latencyMs ? `${fmtSecs(tx.latencyMs)} (${tx.latencyMs} ms)` : '…', 'mono')}
        ${row('d_time', new Date(tx.time).toLocaleString(L === 'id' ? 'id-ID' : 'en-US'), 'mono')}
        ${row('d_kind', kindLabel(tx.kind))}
        ${row('d_amt', `${tx.dir === 'in' ? '+' : '−'}${fmtNum(tx.amount)} $RIALO`, `mono amt ${tx.dir}`)}
        ${row('d_from', esc(tx.from), 'mono wrap')}
        ${row('d_to', esc(tx.to), 'mono wrap')}
        ${row('d_fee', tr('feeVal'), 'mono')}
        ${row('d_memo', esc(tx.memo) || '—')}
        ${row('d_net', esc(chain.network))}
        <p class="rpg-note">${tr('explorerNote')}</p>
      </div>`;
  }
  function openDrawer(sig) { openSig = sig; renderDrawer(sig); $('drawer').classList.add('open'); sfx('blip'); }
  function closeDrawer() { openSig = null; $('drawer').classList.remove('open'); }

  // ---------------------------------------------------------------- toasts
  function toast(title, sub = '', { sig, kind = 'ok' } = {}) {
    const el = document.createElement('div');
    el.className = `rpg-toast ${kind}`;
    el.innerHTML = `<div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${sig ? `<button data-sig="${sig}">${tr('view')}</button>` : ''}`;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4600);
    setTimeout(() => el.remove(), 5200);
  }

  // ---------------------------------------------------------------- faucet button
  let claiming = false;
  function renderFaucet() {
    const btn = root.querySelector('[data-act="claim"]');
    const can = chain.faucet.canClaim();
    btn.disabled = claiming || !can;
    btn.classList.toggle('busy', claiming);
    $('claimLbl').textContent = claiming ? tr('requesting') : can ? tr('request') : tr('nextClaim', { t: fmtCountdown(chain.faucet.remainingMs()) });
    $('faucet').textContent = can && !claiming ? tr('faucetReady', { a: FAUCET_AMOUNT }) : tr('faucetInfo', { a: FAUCET_AMOUNT });
    $('fund').hidden = !(chain.wallet.balance < 1 && can);
  }
  async function claim() {
    if (claiming) return;
    if (!chain.faucet.canClaim()) {
      sfx('cancel');
      toast(tr('toastCool', { t: fmtCountdown(chain.faucet.remainingMs()) }), '', { kind: 'warn' });
      return;
    }
    claiming = true; renderFaucet(); sfx('confirm');
    try {
      const tx = await chain.claimFaucet();
      if (closed) return;
      sfx('claim');
      toast(tr('toastClaim', { a: fmtNum(tx.amount) }),
        tr('toastSub', { s: fmtSecs(tx.latencyMs), slot: fmtNum(tx.slot, 0), sig: shortSig(tx.sig) }), { sig: tx.sig });
    } catch (e) {
      if (!closed) { sfx('cancel'); toast(e.code === 'COOLDOWN' ? tr('toastCool', { t: fmtCountdown(chain.faucet.remainingMs()) }) : e.message, '', { kind: 'warn' }); }
    } finally {
      claiming = false;
      if (!closed) renderFaucet();
    }
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.view) { sfx('blip'); setView(t.dataset.view); return; }
    if (t.dataset.app) { sfx('confirm'); const id = t.dataset.app; close(); onOpenApp?.(id); return; }
    if (t.dataset.sig && !t.dataset.act) { openDrawer(t.dataset.sig); return; }
    switch (t.dataset.act) {
      case 'close': close(); break;
      case 'claim': claim(); break;
      case 'apps': sfx('blip'); setView('apps'); break;
      case 'drawer-close': closeDrawer(); break;
      case 'copy': {
        const ok = await copyText(chain.wallet.publicKey);
        $('copyLbl').textContent = ok ? tr('copied') : chain.wallet.publicKey;
        sfx('blip');
        setTimeout(() => { if (!closed) $('copyLbl').textContent = tr('copy'); }, 1600);
        break;
      }
      case 'copy-sig': {
        const ok = await copyText(t.dataset.sig);
        t.querySelector('span').textContent = ok ? tr('copied') : '—';
        sfx('blip');
        break;
      }
    }
  });

  const offTx = chain.on('tx', () => { renderTxs(); animateBalance(); renderFaucet(); });
  const offChange = chain.on('change', () => { renderPoints(); animateBalance(); renderFaucet(); });

  // live slot / tps / cooldown
  let lastT = performance.now();
  const tick = () => {
    const t = performance.now();
    chain.update?.((t - lastT) / 1000); lastT = t;
    $('slot').textContent = fmtNum(chain.slot, 0);
    $('tps').textContent = fmtNum(chain.tps, 0);
    if (!chain.faucet.canClaim() || claiming) renderFaucet();
  };
  const timer = setInterval(tick, 200);

  renderPoints(); renderTxs(); renderFaucet(); tick();
  sfx('warp', { volume: 0.5, pitch: 1.6 });
  requestAnimationFrame(() => root.classList.add('in'));

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer); cancelAnimationFrame(balAnim);
    offTx(); offChange(); untrap();
    sfx('cancel');
    root.classList.remove('in'); root.classList.add('out');
    setTimeout(() => root.remove(), 220);
    onClose?.();
  }

  return { close, root, setView, get closed() { return closed; } };
}
