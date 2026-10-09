/* =========================================================
   JARVIS OS — widgety pulpitu (MVP): Notatka, Lista, Wynik zadania
   Każdy widget to osobne, przesuwalne okno; można mieć wiele naraz.
   Układ pulpitu nie jest jeszcze zapisywany (kolejna wersja).
   ========================================================= */
'use strict';
(() => {
const { $, h, esc, icon } = J;

const TYPES = {
  note:   { label: 'Notatka', icon: 'notes', w: 300, h: 260 },
  list:   { label: 'Lista', icon: 'list', w: 290, h: 300 },
  result: { label: 'Wynik zadania', icon: 'bolt', w: 340, h: 260, minW: 240, minH: 160 },
  spec:   { label: 'Widget z opisu', icon: 'chart', w: 340, h: 300, minW: 220, minH: 150 }   // docs/spec/05-widgety.md §3 (render: js/widget-spec.js)
};
const fmt = J.mdLite;

const mounts = {
  spec(body, w, ctx) { J.wspec.mount(body, w, ctx); },
  note(body, w) {
    body.innerHTML = '<textarea class="w-note" placeholder="Zacznij pisać…" spellcheck="false"></textarea>';
    const ta = $('textarea', body); ta.value = w.data.text || '';
    ta.oninput = () => { w.data.text = ta.value; J.save(); };
    setTimeout(() => { if (!ta.value) ta.focus(); }, 60);
  },
  list(body, w) {
    body.innerHTML = '<div class="w-list"><div class="w-items"></div><form class="w-add"><input class="input" placeholder="Nowa pozycja…" autocomplete="off"><button class="btn" title="Dodaj">' + icon('plus', 'width="14" height="14"') + '</button></form></div>';
    const box = $('.w-items', body), items = w.data.items;
    const draw = () => {
      box.innerHTML = items.length ? '' : '<div class="empty">Pusta lista</div>';
      items.forEach((it, i) => {
        const r = h('label', { class: 'w-item' + (it.done ? ' done' : '') }, '<input type="checkbox"><span></span><button type="button" class="x" title="Usuń">' + icon('close', 'width="11" height="11"') + '</button>');
        $('input', r).checked = !!it.done; $('span', r).textContent = it.text;
        $('input', r).onchange = e => { it.done = e.target.checked; J.save(); draw(); };
        $('.x', r).onclick = () => { items.splice(i, 1); J.save(); draw(); };
        box.appendChild(r);
      });
    };
    $('form', body).onsubmit = e => { e.preventDefault(); const inp = $('input', e.target), v = inp.value.trim(); if (!v) return; items.push({ text: v, done: false }); inp.value = ''; J.save(); draw(); box.scrollTop = box.scrollHeight; };
    draw();
  },
  result(body, w) {
    body.innerHTML = '<div class="w-result"><div class="w-text"></div><div class="w-foot"><small></small><span class="sp"></span><button class="btn sm ghost" data-a="copy">Kopiuj</button><button class="btn sm ghost" data-a="log">Log</button></div></div>';
    $('.w-text', body).innerHTML = fmt(w.data.text || '').replace(/\n/g, '<br>');
    $('small', body).textContent = w.data.meta || '';
    $('[data-a=copy]', body).onclick = () => { navigator.clipboard?.writeText(w.data.text || '').then(() => J.toast('Skopiowano wynik'), () => J.toast('Nie udało się skopiować')); };
    $('[data-a=log]', body).onclick = () => J.proc.toggle();
  }
};

J.widgets = {
  TYPES,
  list: [],
  /* rejestruje aplikację-okno dla widgetu; zapis stanu: J.state.widgets (treść) + winPos (pozycja) */
  register(w) {
    const t = TYPES[w.type], key = 'w:' + w.id, sz = w.type === 'spec' ? J.wspec.sizeOf(w.spec) : [t.w, t.h];
    J.apps[key] = {
      title: w.title, icon: w.spec?.icon || t.icon, w: sz[0], h: sz[1], minW: t.minW || 200, minH: t.minH || 140, widget: true, flush: true,
      mount(body, ctx) {
        ctx.onClose(() => {
          const copy = JSON.parse(JSON.stringify(w)), pos = J.state.winPos[key] ? { ...J.state.winPos[key] } : null;
          delete J.apps[key]; J.widgets.list = J.widgets.list.filter(x => x.id !== w.id); J.state.widgets = J.state.widgets.filter(x => x.id !== w.id); delete J.state.winPos[key]; J.save();
          /* zamknięcie widgetu ✕ = usunięcie; zostawiamy „Cofnij” (polecenie widgets_remove ma własne cofanie, więc wtedy po cichu) */
          if (!w._silent && J.undo) { const e = J.undo.push({ id: 'widgets_remove', label: 'Usuń widget', text: 'Usunięto widget „' + w.title + '”', undo: () => J.widgets.restoreOne(copy, pos), source: 'ui' }); J.undo.offer(e); }
        });
        mounts[w.type](body, w, ctx);
        J.widgets.applyCollapse(w);
        /* dwuklik nazwy = zmiana nazwy (dwuklik reszty nagłówka dalej maksymalizuje) */
        const tb = ctx.el?.querySelector?.('.win-head b'); if (tb) tb.ondblclick = e => { e.stopPropagation(); J.KEY_ACTIONS?.rename && J.wm.open(key) && J.KEY_ACTIONS.rename.run(); };
      }
    };
    J.widgets.list.push(w);
    return key;
  },
  create(type, opts = {}) {
    const t = TYPES[type]; if (!t) throw new Error('Nieznany typ widgetu: ' + type);
    const title = String(opts.title || t.label).slice(0, 60);
    const data = type === 'list'
      ? { items: (Array.isArray(opts.items) ? opts.items : String(opts.content || '').split('\n')).map(x => String(x).replace(/^[-•*\s]+/, '').trim()).filter(Boolean).map(text => ({ text, done: false })) }
      : { text: String(opts.content || ''), meta: opts.meta || '' };
    const w = { id: J.uid(), type, title, data };
    if (type === 'spec') Object.assign(w, { title: String(opts.spec.title).replace(/\{\{[^}]*\}\}/g, '').replace(/[\s—-]+$/, '').slice(0, 60) || 'Widget', spec: opts.spec, prompt: opts.prompt || null, author: opts.author || 'user', created: Date.now(), updated: Date.now(), data: {} });
    J.state.widgets.push(w); J.save();
    const key = J.widgets.register(w); J.wm.open(key); J.wm.remember(key);
    return w;
  },
  /* po starcie: odtwórz widgety z poprzedniej sesji w ich pozycjach */
  restore() {
    J.state.widgets = J.state.widgets.filter(w => TYPES[w.type] && w.data);
    J.state.widgets.forEach(w => { if (!J.apps['w:' + w.id]) J.wm.open(J.widgets.register(w)); });
  },
  /* przywraca usunięty widget (Cofnij) w tej samej pozycji */
  restoreOne(copy, pos) {
    if (!copy || J.widgets.list.some(x => x.id === copy.id)) return false;
    delete copy._silent; J.state.widgets.push(copy); if (pos) J.state.winPos['w:' + copy.id] = pos; J.save();
    J.wm.open(J.widgets.register(copy)); return true;
  },
  remove(id, opts = {}) { const key = 'w:' + id; const w0 = J.widgets.list.find(x => x.id === id); if (w0 && opts.silent) w0._silent = true; if (J.wm.isOpen(key)) J.wm.close(key); else { J.widgets.list = J.widgets.list.filter(x => x.id !== id); J.state.widgets = J.state.widgets.filter(x => x.id !== id); delete J.apps[key]; J.save(); } },
  /* odśwież zawartość po zmianie danych (np. przez narzędzie) */
  refresh(id) { const key = 'w:' + id, w = J.widgets.list.find(x => x.id === id), ctx = J.wm.ctx(key); if (w && ctx) { if (w.type === 'spec') { J.wspec.live.get(id)?.render(); return; } ctx.body.innerHTML = ''; mounts[w.type](ctx.body, w, ctx); ctx.setTitle(w.title); } },
  /* nowy opis widgetu z opisu (widget_edit / Cofnij): zamknij i otwórz ponownie w tym samym miejscu */
  setSpec(id, spec) {
    const w = J.widgets.list.find(x => x.id === id); if (!w) return false;
    const key = 'w:' + id, pos = J.state.winPos[key] ? { ...J.state.winPos[key] } : null, st = J.state.widgets.find(x => x.id === id);
    w.spec = spec; w.updated = Date.now(); w.title = String(spec.title).replace(/\{\{[^}]*\}\}/g, '').replace(/[\s—-]+$/, '').slice(0, 60) || w.title; if (st && st !== w) Object.assign(st, { spec, title: w.title, updated: w.updated });
    if (J.wm.isOpen(key)) { w._silent = true; J.wm.close(key); }
    const copy = JSON.parse(JSON.stringify(w)); delete copy._silent;
    if (!J.widgets.list.some(x => x.id === id)) { J.state.widgets.push(copy); if (pos) J.state.winPos[key] = pos; J.wm.open(J.widgets.register(copy)); }
    J.save(); return true;
  },
  /* kopia obok oryginału (widget_duplicate) */
  duplicate(id) {
    const s = J.widgets.list.find(x => x.id === id); if (!s) return null;
    const c = { id: J.uid(), type: s.type, title: String(s.title + ' (kopia)').slice(0, 60), data: JSON.parse(JSON.stringify(s.data)) };
    const p = J.state.winPos['w:' + s.id]; if (p) J.state.winPos['w:' + c.id] = { ...p, x: (p.x || 0) + 24, y: (p.y || 0) + 24 };
    J.state.widgets.push(c); J.save(); const key = J.widgets.register(c); J.wm.open(key); return c;
  },
  /* zwinięcie do paska tytułu (stan zapisany w widgecie, odtwarzany po starcie) */
  collapse(id, on = true) {
    const w = J.widgets.list.find(x => x.id === id); if (!w) return false;
    w.collapsed = !!on; const st = J.state.widgets.find(x => x.id === id); if (st && st !== w) st.collapsed = w.collapsed; J.save();
    J.widgets.applyCollapse(w); return true;
  },
  applyCollapse(w) {
    const el = J.wm.ctx('w:' + w.id)?.el; if (!el) return;
    el.classList.toggle('collapsed', !!w.collapsed);
    if (w.collapsed) { if (!el.dataset.fullH) el.dataset.fullH = el.style.height || ''; el.style.height = 'auto'; }
    else if (el.dataset.fullH != null) { el.style.height = el.dataset.fullH; delete el.dataset.fullH; }
  },
  menu(x, y) { return J.widgets._menu?.(x, y); }
};
})();
