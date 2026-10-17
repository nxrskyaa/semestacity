// Fully synthesized audio (WebAudio, no files): rain ambience, lo-fi music
// loops (menu / explore / battle) and every SFX in docs/ARCHITECTURE.md.
// API: audio.unlock() (call on first user gesture), audio.sfx(name,{volume,pitch}),
//      audio.setMusic(id|null), audio.setRain(0..1), audio.setVolumes({master,music,sfx})

let ctx = null, master, musicBus, sfxBus, rainBus, noiseBuf = null;
const vol = { master: 0.8, music: 0.55, sfx: 0.8 };

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = vol.master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
  rainBus = ctx.createGain(); rainBus.gain.value = 0; rainBus.connect(master);
  // shared white noise buffer (2 s)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startRain();
}

const now = () => ctx.currentTime;

function noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.005, out = sfxBus, endFreq = null, t = now() } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, endFreq = null, out = sfxBus, t = now(), detune = 0, release = null } = {}) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
  o.connect(g).connect(out);
  o.start(t); o.stop(t + (release ?? dur) + 0.05);
  return o;
}

// ---------------------------------------------------------------- rain bed
let rainNodes = null;
function startRain() {
  const mk = (type, freq, q, g) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = ctx.createGain(); gn.gain.value = g;
    s.connect(f).connect(gn).connect(rainBus); s.start();
    return gn;
  };
  rainNodes = [mk('lowpass', 900, 0.4, 0.5), mk('bandpass', 3200, 0.6, 0.18), mk('highpass', 7000, 0.3, 0.05)];
  // random drips on gutters / umbrellas
  const drip = () => {
    if (!ctx) return;
    if (rainBus.gain.value > 0.02) {
      const t = now();
      tone(1400 + Math.random() * 1800, 0.06, { type: 'sine', gain: 0.025 * rainBus.gain.value, endFreq: 500, out: rainBus, t });
    }
    setTimeout(drip, 60 + Math.random() * 260);
  };
  drip();
}

// ---------------------------------------------------------------- music
// A tiny step sequencer. Each track: bpm, chords (midi arrays), bass, drums pattern.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TRACKS = {
  menu: { bpm: 72, swing: 0, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]], pad: true, drums: null, bass: false, arp: [0, 2, 3, 1, 2, 3, 1, 0] },
  explore: { bpm: 78, swing: 0.12, chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]], pad: true, rhodes: true, bass: true,
    drums: { k: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0] } },
  battle: { bpm: 132, swing: 0, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]], pad: false, saw: true, bass: true, arp: [0, 1, 2, 3, 2, 1, 2, 3],
    drums: { k: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], h: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } },
};
let musicId = null, musicGain = null, seqTimer = null, step = 0, nextTime = 0;

function schedule() {
  const tr = TRACKS[musicId];
  if (!tr) return;
  const spb = 60 / tr.bpm / 4; // 16th
  while (nextTime < now() + 0.15) {
    const bar = Math.floor(step / 16) % tr.chords.length;
    const s16 = step % 16;
    const ch = tr.chords[bar];
    const t = nextTime + (s16 % 2 ? tr.swing * spb : 0);
    const out = musicGain;
    if (s16 === 0) {
      if (tr.pad) for (const n of ch) {
        tone(mtof(n), spb * 16, { type: 'triangle', gain: 0.035, attack: 0.6, out, t, detune: (Math.random() - 0.5) * 8, release: spb * 16 });
        tone(mtof(n + 12), spb * 16, { type: 'sine', gain: 0.012, attack: 0.9, out, t, release: spb * 16 });
      }
      if (tr.bass) tone(mtof(ch[0] - 12), spb * 6, { type: tr.saw ? 'sawtooth' : 'sine', gain: tr.saw ? 0.05 : 0.12, out, t });
    }
    if (tr.rhodes && (s16 === 0 || s16 === 6 || s16 === 10)) {
      for (const n of ch) tone(mtof(n + 12), spb * 5, { type: 'sine', gain: 0.03, attack: 0.004, out, t, release: spb * 6 });
    }
    if (tr.bass && tr.saw && s16 % 4 === 2) tone(mtof(ch[0] - 12), spb * 1.5, { type: 'sawtooth', gain: 0.035, out, t });
    if (tr.arp && (tr.saw ? true : s16 % 2 === 0)) {
      const idx = tr.arp[(s16 / (tr.saw ? 1 : 2) | 0) % tr.arp.length];
      tone(mtof(ch[idx] + (tr.saw ? 24 : 12)), spb * 1.6, { type: tr.saw ? 'square' : 'triangle', gain: tr.saw ? 0.018 : 0.03, out, t });
    }
    const d = tr.drums;
    if (d) {
      if (d.k[s16]) tone(110, 0.25, { type: 'sine', gain: 0.3, endFreq: 40, out, t });
      if (d.s[s16]) { noise(0.18, { type: 'bandpass', freq: 1800, q: 0.7, gain: 0.12, out, t }); tone(190, 0.08, { gain: 0.05, out, t }); }
      if (d.h[s16]) noise(0.04, { type: 'highpass', freq: 8000, gain: tr.saw ? 0.03 : 0.022, out, t });
    }
    nextTime += spb;
    step++;
  }
}

// ---------------------------------------------------------------- SFX
const SFX = {
  blip: (p) => tone(880 * p, 0.06, { type: 'square', gain: 0.05 }),
  confirm: (p) => { tone(660 * p, 0.08, { type: 'triangle', gain: 0.12 }); tone(990 * p, 0.14, { type: 'triangle', gain: 0.12, t: now() + 0.07 }); },
  cancel: (p) => tone(440 * p, 0.12, { type: 'triangle', gain: 0.1, endFreq: 260 * p }),
  step: (p) => noise(0.07, { type: 'bandpass', freq: 900 * p + Math.random() * 400, q: 1.2, gain: 0.08 }),
  talk: (p) => tone((520 + Math.random() * 120) * p, 0.035, { type: 'square', gain: 0.025 }),
  shoot: (p) => { tone(1400 * p, 0.09, { type: 'square', gain: 0.06, endFreq: 300 }); noise(0.06, { type: 'highpass', freq: 3000, gain: 0.08 }); },
  bomb: (p) => tone(300 * p, 0.25, { type: 'triangle', gain: 0.12, endFreq: 700 * p }),
  hit: (p) => { noise(0.12, { type: 'bandpass', freq: 2200 * p, q: 2, gain: 0.25 }); tone(220 * p, 0.1, { type: 'square', gain: 0.06, endFreq: 90 }); },
  explode: (p) => { noise(0.9, { type: 'lowpass', freq: 1800 * p, gain: 0.5, endFreq: 120 }); tone(90 * p, 0.6, { gain: 0.35, endFreq: 30 }); },
  dash: (p) => noise(0.25, { type: 'bandpass', freq: 600 * p, q: 0.8, gain: 0.2, endFreq: 3000 }),
  jump: (p) => tone(300 * p, 0.15, { type: 'sine', gain: 0.12, endFreq: 700 * p }),
  land: (p) => noise(0.1, { type: 'lowpass', freq: 500 * p, gain: 0.18 }),
  lock: (p) => { tone(1200 * p, 0.05, { type: 'square', gain: 0.04 }); tone(1600 * p, 0.05, { type: 'square', gain: 0.04, t: now() + 0.06 }); },
  victory: (p) => [0, 4, 7, 12, 16].forEach((n, i) => tone(mtof(72 + n) * p, 0.5, { type: 'triangle', gain: 0.12, t: now() + i * 0.11, release: 0.9 })),
  defeat: (p) => [7, 4, 0, -5].forEach((n, i) => tone(mtof(64 + n) * p, 0.4, { type: 'triangle', gain: 0.1, t: now() + i * 0.18, release: 0.7 })),
  warp: (p) => { tone(200 * p, 0.7, { type: 'sawtooth', gain: 0.05, endFreq: 1800 * p }); noise(0.7, { type: 'bandpass', freq: 400, q: 3, gain: 0.12, endFreq: 5000 }); },
  door: (p) => { noise(0.5, { type: 'lowpass', freq: 700 * p, gain: 0.08 }); tone(1046 * p, 0.25, { gain: 0.05, t: now() + 0.05 }); tone(1318 * p, 0.35, { gain: 0.05, t: now() + 0.2 }); },
  chime: (p) => [0, 7, 12].forEach((n, i) => tone(mtof(79 + n) * p, 0.6, { type: 'sine', gain: 0.09, t: now() + i * 0.09, release: 1.0 })),
  meow: (p) => {
    // two-formant "mi-aow": rising then falling pitch through a vowel-ish bandpass
    const t = now(), f = 520 * p * (0.9 + Math.random() * 0.25);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.8, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.12); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1800, t + 0.15); bp.frequency.linearRampToValueAtTime(1000, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(bp).connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.6);
  },
  purr: (p) => {
    // ~25 Hz amplitude-modulated low noise for ~1.6 s
    const t = now(), dur = 1.6;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260 * p;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 24; const lg = ctx.createGain(); lg.gain.value = 0.1;
    lfo.connect(lg).connect(g.gain);
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(1, t + 0.2); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(env).connect(sfxBus);
    src.start(t); lfo.start(t); src.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  crank: (p) => { for (let i = 0; i < 5; i++) noise(0.04, { type: 'bandpass', freq: 2400 * p, q: 6, gain: 0.12, t: now() + i * 0.09 }); },
  capsule: (p) => { tone(380 * p, 0.12, { type: 'triangle', gain: 0.14, endFreq: 180 }); noise(0.08, { type: 'lowpass', freq: 1200, gain: 0.1, t: now() + 0.1 }); tone(300 * p, 0.08, { gain: 0.08, t: now() + 0.22 }); },
  reveal: (p) => [0, 7, 12, 19].forEach((n, i) => tone(mtof(72 + n) * p, 0.35, { type: 'triangle', gain: 0.09, t: now() + i * 0.06, release: 0.6 })),
  coin: (p) => { tone(1318 * p, 0.08, { type: 'square', gain: 0.05 }); tone(1975 * p, 0.25, { type: 'square', gain: 0.05, t: now() + 0.07 }); },
  claim: (p) => [0, 4, 7, 12].forEach((n, i) => { tone(mtof(76 + n) * p, 0.2, { type: 'square', gain: 0.035, t: now() + i * 0.07 }); tone(mtof(88 + n) * p, 0.3, { type: 'sine', gain: 0.04, t: now() + i * 0.07 + 0.02 }); }),
  legendary: (p) => {
    [0, 4, 7, 11, 14, 19, 24].forEach((n, i) => tone(mtof(67 + n) * p, 0.6, { type: 'triangle', gain: 0.1, t: now() + i * 0.08, release: 1.2 }));
    noise(1.4, { type: 'highpass', freq: 5000, gain: 0.05, t: now() + 0.4 });
  },
  badge: (p) => [0, 4, 7, 11, 14].forEach((n, i) => tone(mtof(76 + n) * p, 0.4, { type: 'triangle', gain: 0.08, t: now() + i * 0.07, release: 0.8 })),
};

export const audio = {
  unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (ctx && this._pendingMusic !== undefined) { const m = this._pendingMusic; delete this._pendingMusic; this.setMusic(m); }
  },
  sfx(name, { volume = 1, pitch = 1 } = {}) {
    if (!ctx || ctx.state !== 'running') return;
    const f = SFX[name];
    if (!f) return;
    const prev = sfxBus.gain.value;
    if (volume !== 1) { sfxBus.gain.setValueAtTime(vol.sfx * volume, now()); }
    f(pitch);
    if (volume !== 1) sfxBus.gain.setValueAtTime(prev, now() + 0.001);
  },
  setMusic(id) {
    if (!ctx) { this._pendingMusic = id; return; }
    if (id === musicId) return;
    if (musicGain) {
      const g = musicGain;
      g.gain.setTargetAtTime(0.0001, now(), 0.4);
      setTimeout(() => g.disconnect(), 2000);
    }
    clearInterval(seqTimer);
    musicId = id; musicGain = null;
    if (!id || !TRACKS[id]) return;
    musicGain = ctx.createGain();
    musicGain.gain.setValueAtTime(0.0001, now());
    musicGain.gain.setTargetAtTime(1, now(), 0.8);
    musicGain.connect(musicBus);
    step = 0; nextTime = now() + 0.1;
    seqTimer = setInterval(schedule, 40);
  },
  setRain(v) {
    if (!ctx) return;
    rainBus.gain.setTargetAtTime(v * 0.55, now(), 0.5);
  },
  setVolumes({ master: m, music, sfx } = {}) {
    if (m != null) vol.master = m;
    if (music != null) vol.music = music;
    if (sfx != null) vol.sfx = sfx;
    if (!ctx) return;
    master.gain.value = vol.master; musicBus.gain.value = vol.music; sfxBus.gain.value = vol.sfx;
  },
  get volumes() { return { ...vol }; },
};
