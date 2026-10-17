// Promise-based dialogue box: await dialog.say(speaker, text); const i = await dialog.choose(speaker, text, options)
import { audio } from '../core/audio.js';

export function createDialog(parent = document.getElementById('ui')) {
  const el = document.createElement('div');
  el.id = 'dialog';
  el.className = 'hidden';
  el.innerHTML = '<div class="box"><div class="who"></div><div class="qhead hidden"></div><div class="txt"></div><div class="more">▼</div><div class="choices"></div></div>';
  parent.appendChild(el);
  const who = el.querySelector('.who'), txt = el.querySelector('.txt'), more = el.querySelector('.more');
  const choices = el.querySelector('.choices'), qhead = el.querySelector('.qhead');

  let typing = null;      // { full, i, timer }
  let advance = null;     // resolver for say()
  let pick = null;        // { resolve, buttons, sel }

  function setSpeaker(sp) {
    if (!sp) { who.classList.add('hidden'); return; }
    who.classList.remove('hidden');
    who.style.background = sp.color || '#5ee7ff';
    who.innerHTML = `${esc(sp.name)}${sp.role ? `<small>${esc(sp.role)}</small>` : ''}`;
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function type(text, onDone) {
    clearInterval(typing?.timer);
    txt.textContent = '';
    more.classList.add('hidden');
    const full = text;
    let i = 0;
    typing = {
      full,
      finish() { clearInterval(this.timer); txt.textContent = full; typing = null; onDone(); },
      timer: setInterval(() => {
        i += 1;
        txt.textContent = full.slice(0, i);
        if (i % 3 === 0 && full[i] !== ' ') audio.sfx('talk');
        if (i >= full.length) typing.finish();
      }, 18),
    };
  }

  function onKey(e) {
    if (el.classList.contains('hidden')) return;
    if (pick) {
      const n = pick.buttons.length;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { setSel((pick.sel + 1) % n); e.preventDefault(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { setSel((pick.sel - 1 + n) % n); e.preventDefault(); }
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { if (!typing) choose(pick.sel); else typing.finish(); e.preventDefault(); }
      else if (/^Digit[1-9]$/.test(e.code)) { const k = +e.code.slice(5) - 1; if (k < n) choose(k); }
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); next(); }
  }
  function next() {
    if (typing) { typing.finish(); return; }
    if (advance) { const a = advance; advance = null; audio.sfx('blip'); a(); }
  }
  el.addEventListener('mousedown', (e) => { if (!pick && e.button === 0) next(); });
  addEventListener('keydown', onKey);

  function setSel(i) {
    if (!pick) return;
    pick.sel = i;
    pick.buttons.forEach((b, k) => b.classList.toggle('sel', k === i));
    audio.sfx('blip', { pitch: 1.2 });
  }
  function choose(i) {
    if (!pick) return;
    const p = pick; pick = null;
    audio.sfx('confirm');
    p.resolve(i);
  }

  const api = {
    get isOpen() { return !el.classList.contains('hidden'); },
    open() { el.classList.remove('hidden'); },
    close() {
      el.classList.add('hidden'); clearInterval(typing?.timer); typing = null; choices.innerHTML = '';
      if (advance) { const a = advance; advance = null; a(); }
      if (pick) { const p = pick; pick = null; p.resolve(-1); }
    },
    setHeader(text) { qhead.textContent = text || ''; qhead.classList.toggle('hidden', !text); },
    say(speaker, text) {
      api.open(); setSpeaker(speaker); choices.innerHTML = '';
      return new Promise((resolve) => {
        type(text, () => more.classList.remove('hidden'));
        advance = resolve;
      });
    },
    /** options: [{label, note?}] -> resolves index (or -1 if closed) */
    choose(speaker, text, options) {
      api.open(); setSpeaker(speaker); choices.innerHTML = '';
      more.classList.add('hidden');
      return new Promise((resolve) => {
        const build = () => {
          const buttons = options.map((o, i) => {
            const b = document.createElement('button');
            b.innerHTML = `<span><span class="num">${i + 1}</span>${esc(o.label)}</span>${o.note ? `<span class="seen">${esc(o.note)}</span>` : ''}`;
            b.addEventListener('mouseenter', () => setSel(i));
            b.addEventListener('click', (e) => { e.stopPropagation(); if (pick) choose(i); });
            choices.appendChild(b);
            return b;
          });
          pick = { resolve, buttons, sel: 0 };
          buttons[0]?.classList.add('sel');
        };
        if (text) type(text, build); else { txt.textContent = txt.textContent; build(); }
      });
    },
    /** mark a choice button (quiz feedback) */
    flash(i, cls) { const b = choices.children[i]; if (b) b.classList.add(cls); },
    dispose() { removeEventListener('keydown', onKey); el.remove(); },
  };
  return api;
}
