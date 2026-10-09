/* =========================================================
   JARVIS OS — magazyn trwały: IndexedDB (klucz → wartość) z zapasem w localStorage
   Przechowuje: historię rozmowy, profil/pamięć, sygnały, streszczenia, uchwyty plików.
   Stan główny (J.state) nadal żyje w localStorage — tu trafiają większe i wolniejsze dane.
   ========================================================= */
'use strict';
(() => {
const DB = 'jarvis-os', VER = 1, STORE = 'kv';
let dbp = null;
const open = () => {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB niedostępne'));
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Nie udało się otworzyć IndexedDB'));
    r.onblocked = () => reject(new Error('IndexedDB zablokowane'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
};
const tx = async (mode, fn) => {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    let out; try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error('transakcja przerwana'));
  });
};
const LS = 'jarvis-os:kv:';
const ls = {
  get: k => { try { const v = localStorage.getItem(LS + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } },
  set: (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { } },
  del: k => { try { localStorage.removeItem(LS + k); } catch (e) { } },
  keys: () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS)) out.push(k.slice(LS.length)); } } catch (e) { } return out; }
};

const pushQ = new Map();
J.store = {
  /* czy IndexedDB działa (ustalane przy pierwszym użyciu) */
  ready: false,
  async get(key, def) {
    try { const v = await tx('readonly', s => s.get(key)); J.store.ready = true; return v === undefined ? def : v; }
    catch (e) { const v = ls.get(key); return v === undefined ? def : v; }
  },
  async set(key, val) {
    try { await tx('readwrite', s => s.put(val, key)); J.store.ready = true; }
    catch (e) { ls.set(key, val); }
  },
  async del(key) {
    try { await tx('readwrite', s => s.delete(key)); } catch (e) { ls.del(key); }
  },
  async keys() {
    try { return await tx('readonly', s => s.getAllKeys()); } catch (e) { return ls.keys(); }
  },
  /* lista z limitem: dopisuje element i utrzymuje max N wpisów */
  /* kolejka per klucz: dwa równoczesne push (odczyt → dopisanie → zapis) gubiły jeden wpis */
  push(key, item, max = 200) {
    const run = (pushQ.get(key) || Promise.resolve()).then(async () => { const l = await J.store.get(key, []); l.push(item); while (l.length > max) l.shift(); await J.store.set(key, l); return l; });
    pushQ.set(key, run.catch(() => { }));
    return run;
  },
  /* przybliżony rozmiar danych (do Monitora systemu) */
  async size() {
    try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return e.usage || 0; } } catch (e) { }
    let n = 0; try { for (let i = 0; i < localStorage.length; i++) n += (localStorage.getItem(localStorage.key(i)) || '').length * 2; } catch (e) { }
    return n;
  },
  async clear() {
    try { await tx('readwrite', s => s.clear()); } catch (e) { }
    ls.keys().forEach(ls.del);
  }
};
})();
