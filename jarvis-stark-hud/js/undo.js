/* =========================================================
   JARVIS OS — cofanie („Cofnij”) i historia nawigacji („wróć” / „dalej”)
   Cofanie: polecenia odwracalne zwracają funkcję undo() w kopercie wyniku (registry.run zapisuje ją tutaj).
   Autonomia A2 (Jev wykonuje zapis sam) działa tylko dlatego, że każdy taki zapis da się cofnąć w ~8 s przyciskiem
   albo w ciągu 10 minut poleceniem „cofnij” / Ctrl Z.
   Wpis może mieć changed(): true, jeśli obiekt zmienił się po akcji (np. ręczna edycja notatki) — wtedy cofnięcie
   nie dzieje się po cichu, tylko zwraca konflikt (użytkownik mówi „cofnij mimo to”).
   Nawigacja: stos migawek (aktywne okno + widok w nim); „wróć” przywraca poprzednią, „dalej” — następną.
   ========================================================= */
'use strict';
(() => {
const KEEP = 20, WINDOW_MS = 10 * 60e3, OFFER_MS = 8000;

J.undo = {
  stack: [],
  /* wpis: { id (polecenie), label, text, undo(), changed?(), ts, source?, logId?, intent?, viaJev? } */
  push(entry) {
    const e = { ts: Date.now(), ...entry }; J.undo.stack.push(e);
    if (J.undo.stack.length > KEEP) J.undo.stack.shift();
    J.emit('undo-stack');
    return e;
  },
  last(maxAge = WINDOW_MS) { const e = J.undo.stack[J.undo.stack.length - 1]; return e && Date.now() - e.ts <= maxAge ? e : null; },
  /* lista do pokazania (najnowsze pierwsze) */
  list(maxAge = WINDOW_MS) { return J.undo.stack.filter(e => Date.now() - e.ts <= maxAge).slice().reverse().map(e => ({ id: e.id, text: e.text || e.label || e.id, ago_s: Math.round((Date.now() - e.ts) / 1000), by: e.viaJev ? 'jev' : e.source || 'user' })); },
  /* cofa ostatnią akcję; zwraca { ok, text, conflict? } */
  async run(maxAge = WINDOW_MS, opts = {}) {
    const e = J.undo.last(maxAge); if (!e) return { ok: false, text: 'Nie mam nic do cofnięcia.' };
    if (!opts.force && typeof e.changed === 'function') { let ch = false; try { ch = !!e.changed(); } catch (err) { } if (ch) return { ok: false, conflict: true, text: '„' + (e.text || e.label || e.id).replace(/\.$/, '') + '” — obiekt zmienił się po tej akcji. Powiedz „cofnij mimo to”, jeśli na pewno.' }; }
    J.undo.stack.pop();
    try { await e.undo(); } catch (err) { return { ok: false, text: 'Nie udało się cofnąć: ' + (err?.message || err) }; }
    J.emit('undo-done', e); J.emit('undo-stack');
    if (e.logId) J.judge?.log.update(e.logId, { outcome: 'undone' });
    if (e.viaJev && e.intent) J.policy?.reject(e.intent);   // odrzucona decyzja Jeva podnosi próg tego polecenia
    J.ev?.emit('action.undone', { tool: e.id });
    return { ok: true, text: 'Cofnięto: ' + (e.text || e.label || e.id) };
  },
  /* cofa kilka ostatnich (count) albo wszystko z ostatnich N minut; zatrzymuje się na pierwszym problemie */
  async runMany({ count, minutes, force } = {}) {
    const since = minutes ? Date.now() - minutes * 60e3 : 0;
    const want = minutes ? J.undo.stack.filter(e => e.ts >= since).length : Math.max(1, count || 1);
    if (!want || !J.undo.last()) return { ok: false, done: 0, text: 'Nie mam nic do cofnięcia.' };
    const texts = []; let done = 0, stop = null;
    for (let i = 0; i < want; i++) { const r = await J.undo.run(WINDOW_MS, { force }); if (!r.ok) { stop = r; break; } done++; texts.push(r.text.replace(/^Cofnięto: /, '')); }
    if (!done) return { ok: false, done, text: stop?.text || 'Nie mam nic do cofnięcia.', conflict: !!stop?.conflict };
    return { ok: true, done, text: 'Cofnięto ' + done + (want > 1 ? ' z ' + want : '') + ': ' + texts.join('; ') + (stop ? '. Zatrzymałem się: ' + stop.text : '') };
  },
  /* pokazuje przycisk „Cofnij” (UI podpina się pod zdarzenie 'undo-offer') */
  offer(entry) { if (entry) J.emit('undo-offer', { entry, ms: OFFER_MS }); },
  clear() { J.undo.stack.length = 0; J.emit('undo-stack'); },
  OFFER_MS
};

/* ---------- historia nawigacji ---------- */
const same = (a, b) => a && b && a.focused === b.focused && JSON.stringify(a.view || null) === JSON.stringify(b.view || null) && a.open.length === b.open.length && a.open.every((w, i) => w.id === b.open[i].id && w.min === b.open[i].min);
const nav = J.nav = {
  stack: [], fwd: [], applying: false,
  snapshot() {
    const f = J.wm.focused(), app = f && J.apps[f];
    let view = null; try { view = app?.state ? app.state(J.wm.ctx(f)) : null; } catch (e) { }
    return { focused: f, view, open: J.wm.info().map(w => ({ id: w.id, min: w.min })) };
  },
  same,
  record() {
    if (nav.applying) return;
    const s = nav.snapshot(); if (same(s, nav.stack[nav.stack.length - 1])) return;
    nav.stack.push(s); if (nav.stack.length > 30) nav.stack.shift();
    nav.fwd.length = 0;   // nowa nawigacja kasuje „dalej” (jak w przeglądarce)
    /* ostatnio otwierane (recent_list, paleta): 20 pozycji bez powtórzeń */
    if (s.focused && !String(s.focused).startsWith('w:')) { const r = J.state.ui.recentViews = (J.state.ui.recentViews || []).filter(x => !(x.app === s.focused && (x.target || null) === (s.view?.target || null))); r.unshift({ app: s.focused, view: s.view?.view || null, target: s.view?.target || null, title: (J.apps[s.focused]?.title || s.focused) + (s.view?.label ? ' — ' + s.view.label : ''), ts: Date.now() }); r.length = Math.min(r.length, 20); J.save(); }
  },
  apply(s) {
    nav.applying = true;
    try { J.wm.open(s.focused, s.view && typeof s.view === 'object' ? { ...s.view, _nav: true } : s.view || undefined); }
    finally { setTimeout(() => { nav.applying = false; }, 60); }
  },
  /* poprzednia migawka z innym oknem albo innym widokiem */
  back() {
    nav.record();
    const cur = nav.stack[nav.stack.length - 1];
    let i = nav.stack.length - 2;
    while (i >= 0 && (!nav.stack[i].focused || !J.apps[nav.stack[i].focused] || (nav.stack[i].focused === cur?.focused && JSON.stringify(nav.stack[i].view) === JSON.stringify(cur?.view)))) i--;
    if (i < 0) return { ok: false, text: 'Nie ma poprzedniego okna, do którego można wrócić.' };
    const target = nav.stack[i];
    nav.fwd.push(...nav.stack.splice(i + 1).reverse());
    nav.apply(target);
    return { ok: true, app: target.focused, view: target.view, text: 'Wróciłem do: ' + (J.apps[target.focused]?.title || target.focused) + (target.view?.label ? ' — ' + target.view.label : '') + '.' };
  },
  forward() {
    while (nav.fwd.length) {
      const s = nav.fwd.pop(); if (!s.focused || !J.apps[s.focused]) continue;
      nav.stack.push(s); nav.apply(s);
      return { ok: true, app: s.focused, view: s.view, text: 'Dalej: ' + (J.apps[s.focused]?.title || s.focused) + (s.view?.label ? ' — ' + s.view.label : '') + '.' };
    }
    return { ok: false, text: 'Nie ma dokąd iść dalej.' };
  }
};
J.on('wm', J.debounce(() => { try { nav.record(); } catch (e) { } }, 250));
J.on('app-view', J.debounce(() => { try { nav.record(); } catch (e) { } }, 250));
})();
/* kliknięcie w interfejsie = polecenie rejestru ze źródłem 'ui' (log, cofanie, jedno źródło prawdy);
   po odwracalnej zmianie pokazuje „Cofnij”, błąd pokazuje jako toast */
J.uiRun = async (id, args = {}, opts = {}) => {
  const r = await J.registry.run(id, args, { source: 'ui' });
  if (r.ok && r.undoEntry && opts.offer !== false) J.undo.offer(r.undoEntry);
  if (!r.ok && opts.quiet !== true) J.toast?.(r.text);
  return r;
};
