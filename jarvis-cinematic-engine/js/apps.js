/* =========================================================
   JARVIS OS — usługi i aplikacje
   ========================================================= */
'use strict';
(() => {
const { $, $$, h, esc, icon } = J;

/* =================== USŁUGI =================== */

/* ---------- bezpieczny kalkulator (parser zejść rekurencyjnych) ---------- */
J.calc = (src) => {
  const s = String(src).toLowerCase().replace(/,/g, '.').replace(/×|x(?=\s*[\d(])/g, '*').replace(/÷|:/g, '/').replace(/\s+/g, '');
  let i = 0;
  const fns = { sqrt: Math.sqrt, pierwiastek: Math.sqrt, sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180), tan: x => Math.tan(x * Math.PI / 180), log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil };
  const consts = { pi: Math.PI, 'π': Math.PI, e: Math.E };
  const peek = () => s[i];
  const num = () => {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    const w = /^[a-zπ]+/.exec(s.slice(i));
    if (w) {
      i += w[0].length;
      if (w[0] in consts) return consts[w[0]];
      if (w[0] in fns) { if (peek() !== '(') throw new Error('oczekiwano ('); i++; const v = expr(); if (s[i++] !== ')') throw new Error('brak )'); return fns[w[0]](v); }
      throw new Error('nieznane: ' + w[0]);
    }
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('brak )'); return v; }
    throw new Error('błąd składni');
  };
  /* minus jednoargumentowy słabszy niż potęga: -2^2 = -(2^2) = -4 (konwencja matematyczna; wcześniej wychodziło 4) */
  const unary = () => { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return pow(); };
  /* silnia: tylko liczby całkowite 0–170 (171! = Infinity); wcześniej pętla do „1000000!” zawieszała kartę */
  const postfix = () => { let v = num(); while (peek() === '%' || peek() === '!') { const c = s[i++]; if (c === '%') v /= 100; else { if (!Number.isInteger(v) || v < 0) throw new Error('silnia tylko z liczby całkowitej ≥ 0'); if (v > 170) throw new Error('silnia za duża (maks. 170!)'); let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f; } } return v; };
  const pow = () => { const b = postfix(); if (peek() === '^') { i++; return Math.pow(b, unary()); } return b; };   // wykładnik może być ujemny: 2^-1
  const term = () => { let v = unary(); while (peek() === '*' || peek() === '/') { const o = s[i++]; const r = unary(); v = o === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  if (!s) throw new Error('puste wyrażenie');
  const v = expr();
  if (i < s.length) throw new Error('nieoczekiwany znak „' + s[i] + '”');
  if (!isFinite(v)) throw new Error('wynik nieskończony');
  return +v.toPrecision(12);
};

/* ---------- pogoda (Open-Meteo, bez klucza) ---------- */
const WX = {
  0: ['☀️', 'bezchmurnie'], 1: ['🌤️', 'przeważnie słonecznie'], 2: ['⛅', 'częściowe zachmurzenie'], 3: ['☁️', 'pochmurno'],
  45: ['🌫️', 'mgła'], 48: ['🌫️', 'szadź'], 51: ['🌦️', 'lekka mżawka'], 53: ['🌦️', 'mżawka'], 55: ['🌧️', 'gęsta mżawka'],
  56: ['🌧️', 'marznąca mżawka'], 57: ['🌧️', 'marznąca mżawka'], 61: ['🌦️', 'lekki deszcz'], 63: ['🌧️', 'deszcz'], 65: ['🌧️', 'ulewa'],
  66: ['🌧️', 'marznący deszcz'], 67: ['🌧️', 'marznący deszcz'], 71: ['🌨️', 'lekki śnieg'], 73: ['🌨️', 'śnieg'], 75: ['❄️', 'śnieżyca'],
  77: ['🌨️', 'krupa śnieżna'], 80: ['🌦️', 'przelotny deszcz'], 81: ['🌧️', 'przelotne opady'], 82: ['⛈️', 'gwałtowne opady'],
  85: ['🌨️', 'przelotny śnieg'], 86: ['❄️', 'intensywny śnieg'], 95: ['⛈️', 'burza'], 96: ['⛈️', 'burza z gradem'], 99: ['⛈️', 'burza z gradem']
};
J.wxInfo = code => WX[code] || ['🌡️', '—'];
J.weather = {
  data: null, ts: 0,
  async geocode(name) {
    let r; try { r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=pl&name=' + encodeURIComponent(name)); } catch (e) { throw new Error('Brak połączenia z serwisem pogody'); }
    const j = await r.json(); if (!j.results?.length) throw new Error('Nie znalazłem miasta „' + name + '”');
    const g = j.results[0]; return { city: g.name, lat: g.latitude, lon: g.longitude, country: g.country };
  },
  async fetch(loc) {
    const s = J.state.settings;
    const l = loc || { city: s.city, lat: s.lat, lon: s.lon };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=6` + '&hourly=temperature_2m,weather_code&forecast_hours=12' + (s.units?.temp === 'F' ? '&temperature_unit=fahrenheit' : '') + (s.units?.wind === 'ms' ? '&wind_speed_unit=ms' : '');
    /* bez sieci: ostatnie znane dane z datą (stale) zamiast pustego komunikatu */
    const lastKnown = () => { const lk = J.state.ui.lastWeather?.[J.norm(l.city || '')]; if (lk) return { ...lk.d, stale: true, fetched: lk.ts }; return null; };
    let r; try { r = await fetch(url); } catch (e) { const lk = lastKnown(); if (lk) return lk; throw new Error('Brak połączenia z serwisem pogody'); }
    if (!r.ok) { const lk = lastKnown(); if (lk) return lk; throw new Error('Serwis pogody niedostępny'); }
    const j = await r.json();
    const d = { city: l.city, current: j.current, daily: j.daily, hourly: j.hourly || null, units: { temp: s.units?.temp === 'F' ? '°F' : '°C', wind: s.units?.wind === 'ms' ? 'm/s' : 'km/h' } };
    { const lw = { ...(J.state.ui.lastWeather || {}), [J.norm(l.city || '')]: { d, ts: Date.now() } };   // ostatnie 8 miast — bez limitu pamięć rosła z każdym sprawdzanym miastem
      J.state.ui.lastWeather = Object.fromEntries(Object.entries(lw).sort((a, b) => b[1].ts - a[1].ts).slice(0, 8)); J.save(); }
    if (!loc || loc.city === s.city) { this.data = d; this.ts = Date.now(); J.emit('weather', d); }
    return d;
  },
  async get(city) {
    if (!city) { if (this.data && Date.now() - this.ts < 10 * 60e3) return this.data; return this.fetch(); }
    // polska odmiana: „we Wrocławiu”, „w Krakowie”, „w Gdańsku”
    const variants = [...new Set([city, city.replace(/iu$/i, ''), city.replace(/ie$/i, 'a'), city.replace(/ie$/i, ''), city.replace(/u$/i, ''), city.replace(/ach$/i, 'y')])];
    let err;
    for (const v of variants) { try { return await this.fetch(await this.geocode(v)); } catch (e) { err = e; } }
    throw err;
  },
  describe(d) {
    const c = d.current, [ico, txt] = J.wxInfo(c.weather_code);
    return `${d.city}: ${Math.round(c.temperature_2m)}°C, ${txt} ${ico}. Odczuwalna ${Math.round(c.apparent_temperature)}°C, wiatr ${Math.round(c.wind_speed_10m)} km/h, wilgotność ${c.relative_humidity_2m}%. Jutro od ${Math.round(d.daily.temperature_2m_min[1])} do ${Math.round(d.daily.temperature_2m_max[1])}°C.`;
  }
};

/* ---------- rynek krypto (CoinGecko + Binance WebSocket na żywo) ---------- */
J.market = (() => {
  /* znane waluty (id CoinGecko, para Binance); lista obserwowanych w Ustawieniach (settings.watchlist, maks. 12) */
  const KNOWN = { BTC: ['bitcoin', 'Bitcoin', 67400], ETH: ['ethereum', 'Ethereum', 3240], SOL: ['solana', 'Solana', 142], BNB: ['binancecoin', 'BNB', 586], XRP: ['ripple', 'XRP', .6], DOGE: ['dogecoin', 'Dogecoin', .15], ADA: ['cardano', 'Cardano', .45], DOT: ['polkadot', 'Polkadot', 6], AVAX: ['avalanche-2', 'Avalanche', 30], LINK: ['chainlink', 'Chainlink', 14], LTC: ['litecoin', 'Litecoin', 80], TRX: ['tron', 'TRON', .12], TON: ['the-open-network', 'Toncoin', 6], SHIB: ['shiba-inu', 'Shiba Inu', .00002], ATOM: ['cosmos', 'Cosmos', 8], MATIC: ['matic-network', 'Polygon', .6], NEAR: ['near', 'NEAR', 5], UNI: ['uniswap', 'Uniswap', 8], XLM: ['stellar', 'Stellar', .1], PEPE: ['pepe', 'Pepe', .00001] };
  const mkCoin = sym => { const k = KNOWN[sym] || [null, sym, 1]; return { id: k[0], sym, name: k[1], pair: sym.toLowerCase() + 'usdt', seed: k[2] }; };
  const COINS = [];
  const data = {};
  const buildCoins = () => { let want = (J.state.settings.watchlist || []).filter(s => /^[A-Z0-9]{2,10}$/.test(String(s)));   // watchlista bywa z importu kopii — tylko kształt tickera
    if (!want.length) want = ['BTC', 'ETH', 'SOL', 'BNB']; want = want.slice(0, 12); COINS.length = 0; want.forEach(sym => { const c = mkCoin(sym); COINS.push(c); if (!data[sym]) data[sym] = { ...c, price: c.seed, chg: 0, spark: [], live: false }; }); };
  buildCoins();
  let ws = null, users = 0, poll = null, tick = null, sim = null, source = '—', loaded = false;
  const emit = sym => J.emit('market', sym);
  const simulate = () => {
    source = 'symulacja (offline)';
    COINS.forEach(c => { const d = data[c.sym]; if (!d.spark.length) { let p = d.price; d.spark = Array.from({ length: 80 }, () => (p *= 1 + (Math.random() - .5) * .01)); d.price = p; } });
    clearInterval(sim);
    sim = setInterval(() => COINS.forEach(c => { const d = data[c.sym]; d.price *= 1 + (Math.random() - .5) * .003; d.spark.push(d.price); d.spark.shift(); d.chg = (d.price - d.spark[0]) / d.spark[0] * 100; emit(c.sym); }), 1500);
  };
  let lastFetched = 0;
  const fetchCG = async () => {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=24h&ids=' + COINS.map(c => c.id).join(','));
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      j.forEach(x => { const c = COINS.find(k => k.id === x.id); if (!c) return; const d = data[c.sym]; d.price = x.current_price; d.chg = x.price_change_percentage_24h || 0; const sp = x.sparkline_in_7d?.price || []; d.spark = sp.filter((_, i) => i % 2 === 0).slice(-80); d.stale = false; emit(c.sym); });
      clearInterval(sim); sim = null; loaded = true; lastFetched = Date.now();
      if (!ws || ws.readyState !== 1) { source = 'CoinGecko'; J.emit('market', null); }   // etykieta „Źródło” musi się przerysować po zmianie
      return true;
    } catch (e) {
      if (!loaded) simulate();
      else { COINS.forEach(c => { data[c.sym].stale = true; }); source = 'dane z ' + (lastFetched ? new Date(lastFetched).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '?') + ' (offline)'; J.emit('market', null); }
      return false;
    }
  };
  let wsRetry = 0, wsT = null;
  const openWS = () => {
    clearTimeout(wsT);
    if (J.state?.settings?.offlineMode) { ws = null; return; }   // „tryb bez sieci” obejmuje też WebSocket, nie tylko fetch
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + COINS.map(c => c.pair + '@miniTicker').join('/'));
      ws.onopen = () => { wsRetry = 0; source = 'Binance · na żywo'; J.emit('market', null); };
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data).data; if (!m) return;
        const c = COINS.find(k => k.pair === m.s.toLowerCase()); if (!c) return;
        const d = data[c.sym], p = +m.c, o = +m.o;
        d.dir = p > d.price ? 1 : p < d.price ? -1 : 0; d.price = p; d.chg = o ? (p - o) / o * 100 : d.chg; d.live = true;
        if (d.spark.length) { d.spark[d.spark.length - 1] = p; }
        emit(c.sym);
      };
      ws.onclose = e => {
        if (e.target !== ws) return;   // zamknięcie celowe (setWatch/unsubscribe/hidden) — ws już wyzerowany albo podmieniony
        ws = null;
        COINS.forEach(c => { data[c.sym].live = false; });
        if (loaded) { source = 'CoinGecko'; J.emit('market', null); }   // etykieta przestaje kłamać „na żywo”
        if ((users || bg) && !document.hidden) { const d = Math.min(60e3, 2000 * 2 ** wsRetry++); wsT = setTimeout(() => { if (!ws && (users || bg)) openWS(); }, d); }
      };
      ws.onerror = () => { try { ws.close(); } catch (e) { } };
    } catch (e) { ws = null; }
  };
  let bg = false, hiddenT = null;
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hiddenT);
    if (document.hidden) { hiddenT = setTimeout(() => { if (ws) { try { ws.close(); } catch (e) { } ws = null; } }, 60e3); }
    else if (users && !ws) openWS();
  });
  J.on?.('settings', () => {   // włączenie trybu bez sieci zrywa strumień od razu; wyłączenie — wznawia
    if (J.state.settings.offlineMode) { clearTimeout(wsT); if (ws) { try { ws.close(); } catch (e) { } ws = null; source = 'tryb bez sieci'; J.emit('market', null); } }
    else if ((users || bg) && !ws) openWS();
  });
  return {
    COINS, data, get source() { return source; },
    async ensure() { if (!loaded) await fetchCG(); return data; },
    /* alerty kursów działają także bez otwartego okna rynku */
    subscribeBackground() { if (bg) return; bg = true; this.subscribe(); },
    subscribe() {
      users++;
      if (users === 1) {
        fetchCG(); poll = setInterval(fetchCG, 90e3);
        openWS();
        clearInterval(tick);
        tick = setInterval(() => { COINS.forEach(c => { const d = data[c.sym]; if (d.spark.length) { d.spark.push(d.price); if (d.spark.length > 80) d.spark.shift(); } }); }, 30e3);
      }
    },
    unsubscribe() {
      users = Math.max(0, users - 1);
      if (!users) { clearInterval(poll); clearInterval(tick); clearInterval(sim); sim = null; if (ws) { try { ws.close(); } catch (e) { } ws = null; } }
    },
    KNOWN,
    /* zmiana listy obserwowanych: przebudowa kart, ponowne połączenie z giełdą */
    setWatch(list) { J.state.settings.watchlist = [...new Set(list.map(x => String(x).toUpperCase()))].slice(0, 12); J.save(); buildCoins(); if (ws) { try { ws.close(); } catch (e) { } ws = null; if (users) openWS(); } loaded = false; if (users || bg) fetchCG(); J.emit('market', null); J.emit('market-list'); return COINS.map(c => c.sym); },
    idFor: sym => KNOWN[String(sym).toUpperCase()]?.[0] || null,
    summary() { return COINS.map(c => `${c.sym} ${J.fmtMoney(data[c.sym].price)} (${data[c.sym].chg >= 0 ? '+' : ''}${data[c.sym].chg.toFixed(2)}%)`).join(', '); }
  };
})();

/* ---------- notatki ---------- */
/* model notatki (docs/spec/06-notatki.md §1): { id, title, body, ts, created, tags[], folder, pinned, deleted, source } */
const TRASH_DAYS = 30, VERSIONS_MAX = 20;
const noteDefaults = n => { if (n.created == null) n.created = n.ts || Date.now(); if (!Array.isArray(n.tags)) n.tags = []; if (n.folder == null) n.folder = ''; if (n.pinned == null) n.pinned = false; if (n.deleted === undefined) n.deleted = null; if (!n.source) n.source = 'user'; return n; };
J.notes = {
  add(title, body = '', extra = {}) {
    const n = noteDefaults({ id: J.uid(), title: title || 'Nowa notatka', body, ts: Date.now(), created: Date.now(), ...extra });
    J.state.notes.unshift(n); J.save(); J.emit('notes', n.id);
    J.log('Utworzono notatkę', n.title, ''); return n;
  },
  /* trwałe usunięcie (kosz używa trash/restore) */
  remove(id) { J.state.notes = J.state.notes.filter(n => n.id !== id); J.save(); J.emit('notes'); J.store.del?.('notes.versions.' + id); },
  live: () => J.state.notes.filter(n => !n.deleted),
  trashed: () => J.state.notes.filter(n => n.deleted).sort((a, b) => b.deleted - a.deleted),
  trash(id) { const n = J.state.notes.find(x => x.id === id); if (!n) return null; n.deleted = Date.now(); J.save(); J.emit('notes'); J.ev?.emit('notes.trashed', { id }); return n; },
  restore(id) { const n = J.state.notes.find(x => x.id === id); if (!n) return null; n.deleted = null; J.save(); J.emit('notes', id); J.ev?.emit('notes.restored', { id }); return n; },
  /* kosz starszy niż 30 dni znika przy starcie */
  purge() { const lim = Date.now() - TRASH_DAYS * 864e5, old = J.state.notes.filter(n => n.deleted && n.deleted < lim); old.forEach(n => J.notes.remove(n.id)); if (old.length) J.log('Kosz notatek', 'Trwale usunięto ' + old.length + ' (starsze niż 30 dni)'); return old.length; },
  /* wersje w IndexedDB: notes.versions.<id> = [{ vid, ts, title, body, by }] */
  async versions(id) { return (await J.store.get('notes.versions.' + id, [])) || []; },
  async version(n, by = 'user') { const k = 'notes.versions.' + n.id, l = (await J.store.get(k, [])) || []; const last = l[l.length - 1]; if (last && last.title === n.title && last.body === n.body) return last; const v = { vid: J.uid(), ts: Date.now(), title: n.title, body: n.body, by }; l.push(v); while (l.length > VERSIONS_MAX) l.shift(); await J.store.set(k, l); J.ev?.emit('notes.version', { id: n.id, by }); return v; },
  migrate() { J.state.notes.forEach(noteDefaults); J.notes.purge(); }
};
J.notes.migrate();

/* ---------- zadania / przypomnienia ---------- */
/* model zadania (docs/spec/07-zadania.md §1) */
const taskDefaults = t => { if (t.created == null) t.created = Date.now(); if (!t.priority) t.priority = 'normal'; if (t.repeat === undefined) t.repeat = null; if (t.seriesId === undefined) t.seriesId = null; if (!Array.isArray(t.subtasks)) t.subtasks = []; if (t.note === undefined) t.note = null; if (t.remind == null) t.remind = 0; if (!t.source) t.source = 'user'; if (t.doneAt === undefined) t.doneAt = null; return t; };
const WD = ['nd', 'pn', 'wt', 'sr', 'cz', 'pt', 'so'];
const ymd = d => d.getFullYear() + '-' + J.pad(d.getMonth() + 1) + '-' + J.pad(d.getDate());
J.tasks = {
  sort() { J.state.tasks.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority])); },
  /* następna data wystąpienia zadania powtarzanego (albo null, gdy reguła się kończy) */
  nextDate(t, from) {
    const r = t.repeat; if (!r || r.rule === 'none') return null;
    const base = new Date((from || t.date) + 'T12:00'); let d = new Date(base);
    if (r.rule === 'daily') d.setDate(d.getDate() + 1);
    else if (r.rule === 'every_n_days') d.setDate(d.getDate() + Math.max(2, +r.n || 2));
    else if (r.rule === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
    else if (r.rule === 'weekly') { const days = (r.days && r.days.length ? r.days : [WD[base.getDay()]]).map(x => WD.indexOf(x)).filter(x => x >= 0); do d.setDate(d.getDate() + 1); while (!days.includes(d.getDay())); }
    else if (r.rule === 'monthly') { const want = +(r.day || base.getDate()); const y = d.getFullYear(), m = d.getMonth() + 1; const last = new Date(y, m + 1, 0).getDate(); d = new Date(y, m, Math.min(want, last), 12); }
    else return null;
    const nd = ymd(d); return r.until && nd > r.until ? null : nd;
  },
  /* po odhaczeniu zadania z serii powstaje dokładnie jedno następne wystąpienie */
  spawnNext(t) {
    const nd = J.tasks.nextDate(t); if (!nd) return null;
    const sid = t.seriesId || (t.seriesId = t.id);
    if (J.state.tasks.some(x => x.seriesId === sid && !x.done && x.id !== t.id)) return null;
    return J.tasks.add(t.time, t.text, nd, { repeat: JSON.parse(JSON.stringify(t.repeat)), seriesId: sid, priority: t.priority, remind: t.remind, subtasks: t.subtasks.map(s => ({ ...s, done: false, id: J.uid() })), note: t.note, source: t.source });
  },
  migrate() { J.state.tasks.forEach(taskDefaults); },
  add(time, text, date = J.today(), extra = {}) {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(time || '').trim());
    const t = m ? J.pad(+m[1]) + ':' + m[2] : '';
    const task = taskDefaults({ id: J.uid(), date, time: t, text: text || 'Zadanie', done: false, fired: false, ...extra });
    J.state.tasks.push(task); J.tasks.sort(); J.save(); J.emit('tasks');
    J.log('Dodano zadanie', (t ? t + ' — ' : '') + task.text); return task;
  },
  today() { return J.state.tasks.filter(t => t.date === J.today()); }
  // sprawdzanie terminów (J.tasks.check) mieszka w context.js — dokładny timer + zaległe po powrocie do karty
};
J.tasks.migrate();

/* ---------- minutnik (globalny) ---------- */
/* minutnik: J.timer = główny (zgodność), J.timers = wszystkie (maks. 5, rozróżniane etykietą), pomodoro 25/5 ×4 + 15 */
const mkTimer = () => ({
  id: J.uid(), end: 0, total: 0, label: '', running: false, paused: false, pausedLeft: 0, pomo: null, _t: null,
  start(sec, label = 'Minutnik', opts = {}) {
    this.total = sec * 1000; this.end = Date.now() + this.total; this.label = label; this.running = true; this.paused = false; this.pomo = opts.pomo || null;
    clearInterval(this._t); this._t = setInterval(() => this.tick(), 250);
    J.log('Minutnik uruchomiony', label + ' · ' + J.timer.fmt(sec * 1000), 'info'); J.emit('timer');
  },
  stop() { this.running = false; this.paused = false; clearInterval(this._t); J.emit('timer'); },
  pause() { if (!this.running || this.paused) return; this.pausedLeft = this.left(); this.paused = true; clearInterval(this._t); J.emit('timer'); },
  resume() { if (!this.paused) return; this.end = Date.now() + this.pausedLeft; this.paused = false; clearInterval(this._t); this._t = setInterval(() => this.tick(), 250); J.emit('timer'); },
  extend(sec) { if (!this.running) return; if (this.paused) this.pausedLeft += sec * 1000; else this.end += sec * 1000; this.total += sec * 1000; J.emit('timer'); },
  left() { return this.paused ? this.pausedLeft : Math.max(0, this.end - Date.now()); },
  fmt(ms) { const s = Math.ceil(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (hh ? hh + ':' + J.pad(mm) : J.pad(mm)) + ':' + J.pad(ss); },
  tick() {
    J.emit('timer');
    if (this.running && !this.paused && this.left() <= 0) {
      this.stop(); J.sfx.alarm(); J.orb.set('alert', '⏰ ' + this.label + ' — czas minął!');
      J.toast('⏰ ' + this.label + ' — czas minął!', 6000); J.log('Minutnik zakończony', this.label, 'warn');
      J.voice.speak(this.label + '. Czas minął.', { priority: 2 }); J.notify?.('Jarvis — minutnik', this.label + ': czas minął');
      J.emit('timer-ended', this);
      if (this.pomo) J.timers.pomoNext(this);
      setTimeout(() => J.orb.state === 'alert' && J.orb.set('idle'), 4000);
    }
  }
});
J.timer = mkTimer();
J.timers = {
  extras: [], MAX: 5,
  all() { return [J.timer, ...J.timers.extras].filter(t => t.running); },
  find(label) { const n = J.norm(label || ''); return J.timers.all().find(t => J.norm(t.label) === n) || J.timers.all().find(t => n && J.norm(t.label).includes(n)); },
  /* ta sama etykieta = restart tego minutnika; inna = nowy (maks. 5), główny zajęty → dodatkowy */
  start(sec, label = 'Minutnik', opts = {}) {
    const same = J.timers.all().find(t => J.norm(t.label) === J.norm(label));
    if (same) { same.start(sec, label, opts); return same; }
    if (!J.timer.running) { J.timer.start(sec, label, opts); return J.timer; }
    if (J.timers.all().length >= J.timers.MAX) throw Object.assign(new Error('Działa już ' + J.timers.MAX + ' minutników — zatrzymaj któryś (np. „zatrzymaj minutnik ' + J.timers.all()[0].label + '”).'), { code: 'LIMIT' });
    let t = J.timers.extras.find(x => !x.running); if (!t) { t = mkTimer(); J.timers.extras.push(t); }
    t.start(sec, label, opts); return t;
  },
  /* pomodoro: praca 25 → przerwa 5 (×3) → po 4. rundzie 15 */
  pomodoro() { return J.timers.start(1500, 'Pomodoro 1/4 — praca', { pomo: { round: 1, phase: 'work' } }); },
  pomoNext(t) {
    const p = t.pomo; let next;
    if (p.phase === 'work') next = p.round >= 4 ? { round: p.round, phase: 'long', sec: 900, label: 'Pomodoro — długa przerwa' } : { round: p.round, phase: 'break', sec: 300, label: 'Pomodoro ' + p.round + '/4 — przerwa' };
    else if (p.phase === 'break') next = { round: p.round + 1, phase: 'work', sec: 1500, label: 'Pomodoro ' + (p.round + 1) + '/4 — praca' };
    else { J.toast('Pomodoro zakończone — 4 rundy. Brawo!'); return; }
    setTimeout(() => { try { J.timers.start(next.sec, next.label, { pomo: { round: next.round, phase: next.phase } }); J.toast('▶ ' + next.label); } catch (e) { } }, 1500);
  }
};

/* ---------- skróty na pulpicie ---------- */
J.shortcuts = {
  add(name, target = {}) {
    const s = { id: J.uid(), name: name || 'Nowy skrót', app: target.app || null, url: target.url || null, icon: target.icon || (target.url ? 'link' : target.app ? J.apps[target.app]?.icon : 'star') };
    J.state.shortcuts.push(s); J.save(); J.emit('shortcuts');
    J.log('Nowy skrót na pulpicie', s.name); return s;
  },
  remove(id) { J.state.shortcuts = J.state.shortcuts.filter(s => s.id !== id); J.save(); J.emit('shortcuts'); },
  run(s) {
    if (s.url) { window.open(s.url, '_blank', 'noopener'); J.toast('Otwieram ' + s.name); }
    else if (s.app && J.apps[s.app]) J.wm.open(s.app);
    else J.toast('Skrót „' + s.name + '” nie ma jeszcze celu — edytuj go prawym przyciskiem');
  }
};

/* ---------- wykres liniowy (sparkline) ---------- */
J.spark = (canvas, arr, color, fill = true) => {
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, hgt = canvas.clientHeight;
  if (!w || !hgt) return;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
  if (!arr || arr.length < 2) return;
  let mn = Math.min(...arr), mx = Math.max(...arr); if (mx === mn) { mx += 1; mn -= 1; }
  const X = i => i / (arr.length - 1) * w, Y = v => hgt - 3 - (v - mn) / (mx - mn) * (hgt - 6);
  c.beginPath(); arr.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
  c.strokeStyle = color; c.lineWidth = 1.6; c.shadowColor = color; c.shadowBlur = 6; c.stroke(); c.shadowBlur = 0;
  if (fill) { c.lineTo(w, hgt); c.lineTo(0, hgt); c.closePath(); const g = c.createLinearGradient(0, 0, 0, hgt); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00'); c.fillStyle = g; c.fill(); }
};
const accent = () => J.state.settings.accent;

/* ---------- pomocnik: subskrypcja zdarzeń z auto-sprzątaniem ---------- */
// lekka wersja: zdarzenia z flagą życia okna
const sub = (ctx, ev, fn) => ctx.onClose(J.on(ev, fn));
/* widok w aplikacji: argument okna może być tekstem (stary sposób) albo obiektem { view, target } (app_view, historia „wróć”) */
const viewOf = arg => arg && typeof arg === 'object' ? arg : null;
const flash = el => { if (!el) return; el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 2200); };
J.viewOf = viewOf;

/* =================== APLIKACJE =================== */

/* ---------- CZAT ---------- */
J.apps.chat = {
  title: 'Czat z Jarvisem', icon: 'chat', minW: 320, minH: 360, w: 420, h: 540, flush: true,
  mount(body, ctx, arg) {
    body.innerHTML = `<div class="chat">
      <div class="panel-head" style="font-weight:600"><span class="status"></span> Jarvis <span class="mode-pill" id="modePill"></span>
        <select class="input chat-thread" id="chatThread" title="Wątek rozmowy"></select>
        <button class="btn sm ghost" id="chatFind" title="Szukaj w rozmowach">${icon('search', 'width="12" height="12"')}</button>
        <button class="btn sm ghost" id="chatMore" title="Więcej: eksport, nowy wątek">⋯</button>
        <button class="btn sm ghost" id="chatClear" title="Wyczyść rozmowę (można cofnąć)">${icon('refresh', 'width="12" height="12"')}</button>
        <button class="btn sm ghost" id="chatHide" title="Schowaj panel czatu">${icon('close', 'width="12" height="12"')}</button></div>
      <div class="messages" id="messages"></div>
      <div class="suggest" id="suggest"></div>
      <div class="chat-att" id="chatAtt"></div>
      <div class="composer">
        <button class="mic" id="chatMic" title="Mów">${icon('mic')}</button>
        <button class="mic" id="chatClip" title="Dołącz notatkę albo plik tekstowy" aria-label="Dołącz">📎</button><input type="file" id="chatFile" accept=".txt,.md,.markdown,.csv,.json,.log,.ics,text/*" hidden>
        <textarea class="input" id="chatInput" rows="1" placeholder="Powiedz Jarvisowi, co ma zrobić… (Shift Enter — nowa linia)" autocomplete="off"></textarea>
        <button class="send" id="chatSend" title="Wyślij">${icon('send')}</button>
      </div></div>`;
    const box = $('#messages', body), input = $('#chatInput', body);
    /* załączniki (tylko tekst): chipy nad polem wpisywania, ✕ usuwa */
    const attBox = $('#chatAtt', body);
    const drawAtt = () => { if (!attBox) return; attBox.innerHTML = ''; (J.attach?.list || []).forEach(a => { const c = h('span', { class: 'chip' }, '<span></span><button type="button" class="x" aria-label="Usuń załącznik">×</button>'); c.querySelector('span').textContent = (a.kind === 'note' ? '📝 ' : '📄 ') + a.name + (a.cut ? ' (przycięte)' : ''); c.querySelector('.x').onclick = () => J.attach.remove(a.id); attBox.appendChild(c); }); };
    sub(ctx, 'attach', drawAtt); drawAtt();
    $('#chatClip', body).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); J.ctxMenu?.(r.left, r.top - 10, [...J.notes.live().slice(0, 8).map(n => ({ ic: 'notes', t: 'Notatka: ' + n.title, run: () => J.uiRun('chat_attach', { note: n.id }, { offer: false }) })), { ic: 'download', t: 'Plik tekstowy z dysku…', run: () => $('#chatFile', body).click() }]); };
    $('#chatFile', body).onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 1024 * 1024) return J.toast('Plik jest za duży (limit 1 MB).'); const r = J.attach.add({ kind: 'file', name: f.name, text: await f.text() }); if (r.err) J.toast(r.err); };
    const pill = () => { const ai = J.aiReady(), st = J.hermes.status, p = $('#modePill', body); p.textContent = !ai ? 'tryb lokalny' : st === 'up' ? 'Hermes · ' + J.state.settings.hermesModel : st === 'down' ? 'Hermes offline · tryb lokalny' : 'Hermes · sprawdzam…'; p.classList.toggle('ai', ai && st === 'up'); p.classList.toggle('bad', ai && st === 'down'); };
    pill(); sub(ctx, 'settings', pill); sub(ctx, 'hermes', pill);
    J.chat.bind(box);
    const sugg = ['Co potrafisz?', 'Jaka jest pogoda?', 'Kurs bitcoina', 'Ustaw minutnik na 5 minut', 'Zanotuj: kupić mleko', 'Przypomnij mi o 18:00 trening', 'Oblicz 15% z 2400', 'Zmień motyw na fiolet'];
    $('#suggest', body).innerHTML = sugg.map(s => `<button>${esc(s)}</button>`).join('');
    $('#suggest', body).onclick = e => { const b = e.target.closest('button'); if (b) J.brain.handle(b.textContent); };
    const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight || 36, 6 * 20 + 16) + 'px'; };
    const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; fit(); J.brain.handle(v); };
    $('#chatSend', body).onclick = send;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === 'ArrowUp' && !input.value) { input.value = J.chat.lastUser() || ''; fit(); } });
    input.addEventListener('input', fit);
    /* wątki */
    const drawThreads = () => { const sel = $('#chatThread', body); if (!sel) return; sel.innerHTML = ''; J.threads.list().forEach(t => { const o = J.h('option', { value: t.id }); o.textContent = t.name; sel.appendChild(o); }); const o = J.h('option', { value: '__new' }); o.textContent = '+ Nowy wątek…'; sel.appendChild(o); sel.value = J.threads.current(); };
    drawThreads(); sub(ctx, 'thread', drawThreads);
    $('#chatThread', body).onchange = e => { const v = e.target.value; if (v === '__new') { const n = prompt('Nazwa nowego wątku:', 'Nowy wątek'); if (n && n.trim()) J.uiRun('chat_thread', { op: 'new', name: n.trim() }, { offer: false }); else drawThreads(); } else J.uiRun('chat_thread', { op: 'switch', name: v }, { offer: false }); };
    $('#chatFind', body).onclick = () => J.palette.open('');
    $('#chatMore', body).onclick = e => { const r = e.target.getBoundingClientRect(); J.ctxMenu?.(r.left, r.bottom + 4, [
      { ic: 'download', t: 'Eksportuj ten wątek (.md)', run: () => J.uiRun('chat_export', { range: 'session' }) },
      { ic: 'download', t: 'Eksportuj wszystkie wątki (.md)', run: () => J.uiRun('chat_export', { range: 'all' }) },
      { ic: 'plus', t: 'Nowy wątek', run: () => { const n = prompt('Nazwa nowego wątku:', 'Nowy wątek'); if (n && n.trim()) J.uiRun('chat_thread', { op: 'new', name: n.trim() }, { offer: false }); } },
      { ic: 'notes', t: 'Zmień nazwę wątku', run: () => { const n = prompt('Nowa nazwa wątku:'); if (n && n.trim()) J.uiRun('chat_thread', { op: 'rename', name: n.trim() }); } },
      { ic: 'refresh', t: 'Ponów ostatnie pytanie', run: () => { const l = J.chat.lastUser(); if (l) J.brain.handle(l); } },
      '-', { ic: 'trash', t: 'Wyczyść ten wątek', danger: true, run: () => J.uiRun('chat_clear', {}) }
    ]); };
    $('#chatMic', body).onclick = () => J.ear.toggle();
    sub(ctx, 'ear', on => $('#chatMic', body)?.classList.toggle('rec', on));
    $('#chatHide', body).onclick = () => J.chatPanel.hide();
    $('#chatClear', body).onclick = () => J.uiRun('chat_clear', {});
    ctx.onClose(() => J.chat.unbind(box));
    setTimeout(() => input.focus(), 50);
    if (arg) J.brain.handle(arg);
  },
  onArg(arg) { if (arg) J.brain.handle(arg); }
};

/* historia czatu (niezależna od okna) */
/* ---------- wątki rozmów: każdy ma własną historię dla modelu, dymki i streszczenie („Ogólny” = stare klucze) ---------- */
J.threads = {
  list() { const l = J.state.ui.threads = J.state.ui.threads || []; if (!l.some(t => t.id === 'main')) l.unshift({ id: 'main', name: 'Ogólny', ts: Date.now() }); return l; },
  current: () => J.state.ui.thread && J.threads.list().some(t => t.id === J.state.ui.thread) ? J.state.ui.thread : 'main',
  key: (k, id) => { const t = id || J.threads.current(); return t === 'main' ? 'chat.' + k : 'chat.t.' + t + '.' + k; },
  byName(q) { const n = J.norm(q); return J.threads.list().find(t => t.id === q || J.norm(t.name) === n) || J.threads.list().find(t => J.norm(t.name).includes(n)); },
  touch() { const t = J.threads.list().find(x => x.id === J.threads.current()); if (t) { t.ts = Date.now(); J.save(); } },
  create(name) { const l = J.threads.list(); if (l.length >= 50) throw Object.assign(new Error('Masz już 50 wątków — usuń albo użyj istniejącego.'), { code: 'LIMIT' }); const t = { id: J.uid(), name: String(name || 'Nowy wątek').slice(0, 40), ts: Date.now() }; l.push(t); J.save(); return t; },
  async switch(id) { if (id === J.threads.current()) return; J.state.ui.thread = id; J.save(); await J.brain?.reload?.(); await J.chat.reload(); J.emit('thread'); }
};
J.chat = (() => {
  let items = [], box = null, restored = false;
  const persist = J.debounce(() => J.store.set(J.threads.key('items'), items.filter(i => !i.typing).slice(-80).map(({ role, text }) => ({ role, text }))), 500);
  const restore = async () => { if (restored) return; restored = true; try { const saved = await J.store.get(J.threads.key('items'), []); if (saved.length && !items.some(i => i.role === 'user')) { items = saved.map(x => ({ ...x })); if (box) { box.innerHTML = ''; items.forEach(it => box.appendChild(draw(it))); scroll(); } } } catch (e) { } };
  const fmt = J.mdLite;
  const draw = it => {
    const e = h('div', { class: 'msg ' + it.role });
    if (it.role === 'link') { const a = h('a', { href: it.text, target: '_blank', rel: 'noopener' }); a.textContent = it.text; e.appendChild(a); it.el = e; return e; }
    if (it.typing) e.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; else e.innerHTML = fmt(it.text);
    if (it.role === 'jarvis' && it.text) { const pin = h('button', { class: 'msg-pin', title: 'Przypnij jako widget' }, icon('pin', 'width="11" height="11"')); pin.onclick = () => J.widgets.create('result', { title: it.text.slice(0, 40), content: it.text, meta: 'Z czatu · ' + J.hhmm() }); e.appendChild(pin); }
    /* moja wiadomość: ✎ wstawia ją do pola (popraw i wyślij), ↻ wysyła jeszcze raz — widoczne przy ostatniej (CSS) */
    if (it.role === 'user' && it.text) { const bar = h('span', { class: 'msg-acts' }, '<button type="button" title="Popraw (wstaw do pola)" aria-label="Popraw wiadomość">✎</button><button type="button" title="Wyślij ponownie" aria-label="Wyślij ponownie">↻</button>'); bar.children[0].onclick = () => { const inp = J.$('#chatInput'); if (inp) { inp.value = it.text; inp.focus(); inp.dispatchEvent(new Event('input')); } }; bar.children[1].onclick = () => J.brain.handle(it.text); e.appendChild(bar); }
    it.el = e; return e;
  };
  const scroll = () => { if (box) box.scrollTop = box.scrollHeight; };
  const api = {
    bind(b) { box = b; b.innerHTML = ''; restore(); if (!items.length) api.add('jarvis', 'Jestem gotowy. To moje środowisko — otwieram aplikacje, tworzę notatki, skróty i przypomnienia, sprawdzam pogodę i rynek. Napisz lub powiedz, co mam zrobić.' + (J.aiReady() ? '\n\nHermes (' + J.state.settings.hermesModel + ') jest skonfigurowany — status połączenia widać w nagłówku.' : '\n\nWskazówka: podłącz Hermesa (Nous Research) w Ustawieniach, a odpowiem na każde pytanie.'), true); else items.forEach(it => b.appendChild(draw(it))); scroll(); },
    unbind(b) { if (box === b) box = null; },
    reset() { items = []; J.store.del(J.threads.key('items')); },
    /* ponowne wczytanie po zmianie wątku */
    async reload() { items = []; restored = false; if (box) { box.innerHTML = ''; await restore(); if (!items.length) api.add('jarvis', 'Wątek „' + (J.threads.list().find(t => t.id === J.threads.current())?.name || '') + '”. O czym rozmawiamy?', true); } else await restore(); },
    items: () => items.filter(i => !i.typing).map(({ role, text }) => ({ role, text })),
    /* kopia do „Cofnij” po wyczyszczeniu */
    snapshot: () => items.filter(i => !i.typing).map(({ role, text }) => ({ role, text })),
    async restoreSnapshot(l) { items = l.map(x => ({ ...x })); await J.store.set(J.threads.key('items'), l); if (box) { box.innerHTML = ''; items.forEach(it => box.appendChild(draw(it))); scroll(); } },
    /* szukanie w rozmowach wszystkich wątków */
    async searchAll(q) {
      const out = [], cur = J.threads.current();
      for (const t of J.threads.list()) {
        const l = t.id === cur ? api.items() : await J.store.get(J.threads.key('items', t.id), []);
        l.forEach((it, i) => { if (it.role !== 'user' && it.role !== 'jarvis') return; const sc = J.search.score(q, it.text); if (sc) out.push({ id: t.id + ':' + i, text: it.text, role: it.role, thread: t.name, threadId: t.id, index: i, score: sc * .9 }); });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, 30);
    },
    async goto(threadId, index) {
      if (threadId && threadId !== J.threads.current()) await J.threads.switch(threadId);
      J.chatPanel?.show(); const l = items.filter(i => !i.typing), it = l[index]; if (it?.el) { it.el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); it.el.classList.remove('hl'); void it.el.offsetWidth; it.el.classList.add('hl'); }
    },
    /* rozmowa jako Markdown */
    async markdown(scope = 'session') {
      const threads = scope === 'all' ? J.threads.list() : J.threads.list().filter(t => t.id === J.threads.current());
      let md = '# Rozmowa z Jarvisem — ' + new Date().toLocaleString('pl-PL') + '\n';
      for (const t of threads) {
        const l = t.id === J.threads.current() ? api.items() : await J.store.get(J.threads.key('items', t.id), []);
        md += '\n## Wątek: ' + t.name + '\n\n' + l.map(it => it.role === 'user' ? '**Ty:** ' + it.text : it.role === 'jarvis' ? '**Jarvis:** ' + it.text : '> ' + it.text).join('\n\n') + '\n';
      }
      return md;
    },
    link(url) { const it = { role: 'link', text: url }; items.push(it); if (box) { const e = h('div', { class: 'msg link' }); const a = h('a', { href: url, target: '_blank', rel: 'noopener' }); a.textContent = url; e.appendChild(a); it.el = e; box.appendChild(e); scroll(); } },
    /* szybkie odpowiedzi (ui_ask / potwierdzenia): zwraca element do usunięcia */
    quick(question, options, onPick) { if (!box) return null; const e = h('div', { class: 'msg quick' }, '<div class="q"></div><div class="opts"></div>'); e.querySelector('.q').textContent = question; const o = e.querySelector('.opts'); options.forEach(op => { const b = h('button', { class: 'btn sm' + (op.primary ? ' primary' : op.danger ? ' ghost danger' : ' ghost') }, ''); b.textContent = op.label; b.onclick = () => onPick(op.value); o.appendChild(b); }); box.appendChild(e); scroll(); return e; },
    add(role, text, silent) {
      const it = { role, text: text || '', typing: role === 'jarvis' && text === '' };
      items.push(it); if (items.length > 200) items.shift();
      if (box) { box.appendChild(draw(it)); scroll(); }
      if (!silent) persist();
      return {
        set(t) { persist(); it.text = t; it.typing = false; if (it.el) { it.el.innerHTML = fmt(t); if (it.role === 'jarvis' && t) { const pin = h('button', { class: 'msg-pin', title: 'Przypnij jako widget' }, icon('pin', 'width="11" height="11"')); pin.onclick = () => J.widgets.create('result', { title: t.slice(0, 40), content: t, meta: 'Z czatu · ' + J.hhmm() }); it.el.appendChild(pin); } } scroll(); },
        get text() { return it.text; },
        remove() { items = items.filter(x => x !== it); it.el?.remove(); }
      };
    },
    lastUser() { for (let i = items.length - 1; i >= 0; i--) if (items[i].role === 'user') return items[i].text; },
    get visible() { return !!box && J.wm.isOpen('chat') && !J.wm.isMin('chat'); }
  };
  return api;
})();

/* ---------- bezpieczny podgląd Markdown (najpierw escape, potem kilka reguł; linki tylko http/https) ---------- */
J.md = src => {
  const inline = t => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = []; let list = null, code = false;
  const close = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  esc(String(src || '')).split('\n').forEach(l => {
    if (/^```/.test(l)) { close(); out.push(code ? '</pre>' : '<pre>'); code = !code; return; }
    if (code) { out.push(l + '\n'); return; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { close(); out.push('<h' + (m[1].length + 2) + '>' + inline(m[2]) + '</h' + (m[1].length + 2) + '>'); }
    else if ((m = /^\s*[-*•]\s+\[( |x)\]\s+(.*)$/i.exec(l))) { if (list !== 'ul') { close(); out.push('<ul class="md-check">'); list = 'ul'; } out.push('<li>' + (m[1].trim() ? '☑ ' : '☐ ') + inline(m[2]) + '</li>'); }
    else if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); }
    else if ((m = /^&gt;\s?(.*)$/.exec(l))) { close(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); }
    else if (!l.trim()) { close(); }
    else { close(); out.push('<p>' + inline(l) + '</p>'); }
  });
  close(); if (code) out.push('</pre>');
  return out.join('');
};

/* ---------- NOTATNIK ---------- */
/* lista: przypięte na górze, filtry (wszystkie / przypięte / folder / #tag / kosz), edytor z folderem i tagami,
   podgląd Markdown, historia wersji (wersja przy ≥ 5 min pisania i przed każdą zmianą Jarvisa), kosz 30 dni */
const VERSION_GAP = 5 * 60e3;
J.apps.notes = {
  title: 'Notatnik', icon: 'notes', minW: 420, minH: 280, w: 660, h: 440, flush: true,
  mount(body, ctx, arg) {
    const va = viewOf(arg);
    const argId = typeof arg === 'string' ? arg : va?.view === 'note' ? va.target : null;
    let sel = (argId && J.state.notes.find(n => n.id === argId && !n.deleted)?.id) || J.notes.live()[0]?.id, q = va?.view === 'search' ? String(va.target || '').toLowerCase() : '';
    let filter = va?.view === 'trash' ? { kind: 'trash' } : va?.view === 'tag' ? { kind: 'tag', v: String(va.target || '').replace(/^#/, '') } : va?.view === 'folder' ? { kind: 'folder', v: va.target } : { kind: 'all' };
    let preview = false, histOpen = false, lastClick = null; const multi = new Set();
    body.innerHTML = `<div class="notes">
      <div class="notes-side"><div class="top"><input class="input" placeholder="Szukaj…" id="nq" aria-label="Szukaj w notatkach"><button class="btn" id="nNew" title="Nowa notatka" aria-label="Nowa notatka">${icon('plus', 'width="14" height="14"')}</button></div>
        <div class="nt-filters" id="nFil"></div><div class="notes-list" id="nList"></div></div>
      <div class="notes-main"><input id="nTitle" placeholder="Tytuł" aria-label="Tytuł notatki">
      <div class="nt-meta" id="nMeta"><label>📁 <input id="nFolder" placeholder="folder" maxlength="40"></label><label># <input id="nTags" placeholder="tagi, po przecinku"></label></div>
      <textarea id="nBody" placeholder="Zacznij pisać… (zapis automatyczny, Markdown: # nagłówek, - lista, **pogrubienie**)"></textarea><div class="nt-preview md" id="nPrev" hidden></div>
      <div class="nt-hist" id="nHist" hidden></div>
      <div class="notes-foot" id="nFoot"><span id="nInfo"></span><span class="sp"></span>
        <button class="btn sm ghost" id="nPin" title="Przypnij na górze listy">📌</button>
        <button class="btn sm ghost" id="nPrevB" title="Podgląd Markdown">👁</button>
        <button class="btn sm ghost" id="nHistB" title="Historia wersji">🕘</button>
        <button class="btn sm ghost" id="nDict" title="Dyktuj do tej notatki (koniec: „koniec dyktowania”, 10 s ciszy albo Esc)">🎙</button>
        <button class="btn sm ghost" id="nTask" title="Zrób zadanie z notatki">✓+</button>
        <button class="btn sm ghost" id="nRead" title="Przeczytaj na głos">${icon('sound', 'width="12" height="12"')}</button>
        <button class="btn sm ghost" id="nExp" title="Pobierz jako .md">${icon('download', 'width="12" height="12"')} .md</button>
        <button class="btn sm ghost danger" id="nDel" title="Do kosza" aria-label="Przenieś do kosza">${icon('trash', 'width="12" height="12"')}</button></div>
      <div class="notes-foot" id="nTrashFoot" hidden><span id="nTInfo"></span><span class="sp"></span>
        <button class="btn sm" id="nRestore">Przywróć</button><button class="btn sm ghost danger" id="nPurge">Usuń na zawsze</button><button class="btn sm ghost danger" id="nEmpty">Opróżnij kosz</button></div></div></div>`;
    const list = $('#nList', body), ti = $('#nTitle', body), bo = $('#nBody', body), info = $('#nInfo', body), fil = $('#nFil', body), fo = $('#nFolder', body), tg = $('#nTags', body), pv = $('#nPrev', body), hi = $('#nHist', body);
    const inTrash = () => filter.kind === 'trash';
    const cur = () => J.state.notes.find(n => n.id === sel && (inTrash() ? n.deleted : !n.deleted));
    const words = n => n.body.trim().split(/\s+/).filter(Boolean).length;
    const visible = () => {
      const base = inTrash() ? J.notes.trashed() : J.notes.live();
      const l = base.filter(n => (!q || (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(q))
        && (filter.kind !== 'pinned' || n.pinned) && (filter.kind !== 'folder' || n.folder === filter.v) && (filter.kind !== 'tag' || n.tags.includes(filter.v)));
      return inTrash() ? l : l.slice().sort((a, b) => (b.pinned - a.pinned) || b.ts - a.ts);
    };
    const renderFilters = () => {
      const live = J.notes.live(), folders = [...new Set(live.map(n => n.folder).filter(Boolean))].sort(), tags = [...new Set(live.flatMap(n => n.tags))].sort(), tr = J.notes.trashed().length;
      fil.innerHTML = '';
      const chip = (label, f, title) => { const b = h('button', { class: 'chip' + (filter.kind === f.kind && (filter.v || '') === (f.v || '') ? ' on' : ''), title: title || label }); b.textContent = label; b.onclick = () => { filter = f; const l = visible(); if (!l.some(n => n.id === sel)) sel = l[0]?.id; renderAll(); J.emit('app-view'); }; fil.appendChild(b); };
      chip('Wszystkie', { kind: 'all' });
      if (live.some(n => n.pinned)) chip('📌', { kind: 'pinned' }, 'Przypięte');
      folders.forEach(f => chip('📁 ' + f, { kind: 'folder', v: f }));
      tags.slice(0, 12).forEach(t => chip('#' + t, { kind: 'tag', v: t }));
      chip('🗑' + (tr ? ' ' + tr : ''), { kind: 'trash' }, 'Kosz (30 dni)');
    };
    const renderList = () => {
      const items = visible();
      [...multi].forEach(id => { if (!items.some(x => x.id === id)) multi.delete(id); });
      list.innerHTML = '';
      if (multi.size > 1) {
        const bar = h('div', { class: 'nt-bulk' }, '<b></b><span class="sp"></span>' + (inTrash() ? '<button class="btn sm" data-a="restore">Przywróć</button>' : '<button class="btn sm ghost" data-a="folder">📁</button><button class="btn sm ghost" data-a="tag">#</button><button class="btn sm ghost danger" data-a="trash">🗑</button>') + '<button class="btn sm ghost" data-a="x" aria-label="Odznacz">×</button>');
        bar.querySelector('b').textContent = 'Zaznaczono: ' + multi.size;
        const ids = [...multi], notesOf = () => ids.map(id => J.state.notes.find(x => x.id === id)).filter(Boolean);
        const bulk = (label, apply, undo) => { const l = notesOf(), snap = l.map(x => ({ x, tags: [...x.tags], folder: x.folder, deleted: x.deleted })); apply(l); J.save(); J.emit('notes'); multi.clear(); const e = J.undo.push({ id: 'notes_bulk', label, text: label + ' (' + l.length + ')', undo: () => { snap.forEach(o => Object.assign(o.x, { tags: o.tags, folder: o.folder, deleted: o.deleted })); J.save(); J.emit('notes'); }, source: 'ui' }); J.undo.offer(e); };
        bar.querySelector('[data-a=x]').onclick = () => { multi.clear(); renderList(); };
        bar.querySelector('[data-a=trash]')?.addEventListener('click', () => bulk('Do kosza', l => l.forEach(x => { x.deleted = Date.now(); })));
        bar.querySelector('[data-a=restore]')?.addEventListener('click', () => bulk('Przywrócono', l => l.forEach(x => { x.deleted = null; })));
        bar.querySelector('[data-a=folder]')?.addEventListener('click', () => { const f = prompt('Folder dla ' + ids.length + ' notatek (puste = bez folderu):', ''); if (f != null) bulk('Folder „' + f.trim() + '”', l => l.forEach(x => { x.folder = f.trim().slice(0, 40); })); });
        bar.querySelector('[data-a=tag]')?.addEventListener('click', () => { const t = prompt('Tag dla ' + ids.length + ' notatek:', ''); const c = J.norm(t || '').replace(/^#/, '').replace(/[^a-z0-9_-]/g, '').slice(0, 24); if (c) bulk('Tag #' + c, l => l.forEach(x => { if (!x.tags.includes(c) && x.tags.length < 10) x.tags.push(c); })); });
        list.appendChild(bar);
      }
      if (!items.length) { if (J.ui?.state) J.ui.state(list, 'empty', { text: inTrash() ? 'Kosz jest pusty.' : q ? 'Nic nie pasuje do „' + q + '”.' : 'Brak notatek. Kliknij + albo powiedz „zanotuj …”.' }); else list.innerHTML = '<div class="empty">Brak notatek</div>'; }
      items.forEach(n => {
        const b = h('button', { class: 'note-item' + (n.id === sel ? ' sel' : '') + (multi.has(n.id) ? ' multi' : ''), 'data-id': n.id, draggable: inTrash() ? 'false' : 'true' }, '<b></b><span></span>');
        b.ondragstart = e => { e.dataTransfer.setData('text/x-note', n.id); e.dataTransfer.setData('text/plain', n.title); e.dataTransfer.effectAllowed = 'copy'; };
        b.querySelector('b').textContent = (n.pinned && !inTrash() ? '📌 ' : '') + (n.title || 'Bez tytułu');
        b.querySelector('span').textContent = (inTrash() ? 'usunięta ' + new Date(n.deleted).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : new Date(n.ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + (n.folder ? ' · 📁 ' + n.folder : '') + (n.tags.length ? ' · ' + n.tags.map(t => '#' + t).join(' ') : '');
        b.onclick = e => {
          /* Ctrl/Shift + klik = zaznaczanie wielu (pasek akcji zbiorowych) */
          if (e.ctrlKey || e.metaKey || e.shiftKey) { if (e.shiftKey && lastClick) { const ids = items.map(x => x.id), a = ids.indexOf(lastClick), z = ids.indexOf(n.id); ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(id => multi.add(id)); } else multi.has(n.id) ? multi.delete(n.id) : multi.add(n.id); if (sel && !multi.size) multi.add(sel); lastClick = n.id; renderList(); return; }
          multi.clear(); lastClick = n.id; sel = n.id; histOpen = false; renderList(); renderEd(); J.emit('app-view');
        };
        list.appendChild(b);
      });
    };
    const renderEd = () => {
      const n = cur(), dis = !n || inTrash();
      ti.disabled = bo.disabled = fo.disabled = tg.disabled = dis; ti.value = n?.title || ''; bo.value = n?.body || ''; fo.value = n?.folder || ''; tg.value = (n?.tags || []).join(', ');
      $('#nFoot', body).hidden = inTrash(); $('#nTrashFoot', body).hidden = !inTrash();
      $('#nTInfo', body).textContent = n ? '„' + n.title + '” — w koszu ' + Math.max(0, 30 - Math.floor((Date.now() - n.deleted) / 864e5)) + ' dni' : '';
      $('#nPin', body).classList.toggle('on', !!n?.pinned);
      pv.hidden = !preview || !n; bo.hidden = preview && !!n; if (preview && n) pv.innerHTML = J.md(n.body);
      $('#nPrevB', body).classList.toggle('on', preview);
      info.textContent = n ? words(n) + ' słów' : inTrash() ? '' : 'Utwórz notatkę przyciskiem +';
      if (histOpen && n) renderHist(n); else hi.hidden = true;
    };
    const renderHist = async n => {
      const l = await J.notes.versions(n.id); hi.hidden = false; hi.innerHTML = '<div class="nt-hh"><b>Historia wersji</b><span class="sp"></span><button class="btn sm ghost" data-a="x">Zamknij</button></div>';
      if (!l.length) hi.appendChild(h('div', { class: 'empty' }, 'Brak zapisanych wersji. Wersja powstaje przed każdą zmianą Jarvisa i co ≥ 5 min pisania.'));
      l.slice().reverse().forEach(v => {
        const r = h('div', { class: 'nt-ver' }, '<span></span><small></small><button class="btn sm">Przywróć</button>');
        r.querySelector('span').textContent = new Date(v.ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (v.by === 'jarvis' ? ' · przed zmianą Jarvisa' : v.by === 'restore' ? ' · przed przywróceniem' : '');
        r.querySelector('small').textContent = J.cmdKit.cut(v.body.replace(/\s+/g, ' '), 70);
        r.querySelector('button').onclick = () => J.uiRun('notes_revert', { note: n.id, version: v.vid });
        hi.appendChild(r);
      });
      $('[data-a=x]', hi).onclick = () => { histOpen = false; hi.hidden = true; };
    };
    const renderAll = () => { renderFilters(); renderList(); renderEd(); };
    /* pisanie: wersja przed pierwszą zmianą po ≥ 5 min przerwy */
    let pre = null;
    const upd = J.debounce(() => {
      const n = cur(); if (!n || inTrash()) return;
      if (pre && pre.id === n.id && Date.now() - (n._vAt || 0) >= VERSION_GAP) { J.notes.version(pre, 'user'); n._vAt = Date.now(); }
      pre = null;
      n.title = ti.value; n.body = bo.value; n.ts = Date.now(); J.save(); renderList(); info.textContent = 'Zapisano · ' + words(n) + ' słów';
    }, 350);
    ti.oninput = bo.oninput = () => { const n = cur(); if (n && !pre) pre = { id: n.id, title: n.title, body: n.body }; upd(); };
    fo.onchange = () => { const n = cur(); if (n && fo.value.trim() !== n.folder) J.uiRun('notes_folder', { note: n.id, folder: fo.value.trim() }); };
    tg.onchange = () => { const n = cur(); if (!n) return; const want = tg.value.split(/[,\s]+/).map(t => t.replace(/^#/, '')).filter(Boolean); const cl = t => J.norm(t).replace(/[^a-z0-9_-]/g, ''); const add = want.filter(t => !n.tags.includes(cl(t))), remove = n.tags.filter(t => !want.map(cl).includes(t)); if (add.length || remove.length) J.uiRun('notes_tag', { note: n.id, add, remove }); };
    $('#nq', body).oninput = e => { q = e.target.value.toLowerCase(); renderList(); };
    $('#nNew', body).onclick = () => { if (inTrash()) filter = { kind: 'all' }; const n = J.notes.add('Nowa notatka', '', filter.kind === 'folder' ? { folder: filter.v } : filter.kind === 'tag' ? { tags: [filter.v] } : {}); sel = n.id; renderAll(); ti.select(); };
    $('#nDel', body).onclick = async () => { const n = cur(); if (!n) return; const r = await J.uiRun('notes_delete', { note: n.id }); if (r.ok) { sel = visible()[0]?.id; renderAll(); } };
    $('#nPin', body).onclick = () => { const n = cur(); if (n) J.uiRun('notes_pin', { note: n.id, on: !n.pinned }); };
    $('#nPrevB', body).onclick = () => { preview = !preview; renderEd(); };
    $('#nHistB', body).onclick = () => { histOpen = !histOpen; renderEd(); };
    $('#nTask', body).onclick = () => { const n = cur(); if (n) J.uiRun('notes_to_task', { note: n.id }); };
    $('#nDict', body).onclick = () => { const n = cur(); if (!n) return; if (J.dictation?.active) J.uiRun('notes_dictate', { stop: true }, { offer: false }); else J.uiRun('notes_dictate', { note: n.id }, { offer: false }); };
    sub(ctx, 'dictation', on => { $('#nDict', body).classList.toggle('rec', !!on); $('#nDict', body).textContent = on ? '● 🎙' : '🎙'; });
    $('#nExp', body).onclick = () => { const n = cur(); if (!n) return; const fm = (n.tags.length || n.folder) ? '---\n' + (n.folder ? 'folder: ' + n.folder + '\n' : '') + (n.tags.length ? 'tags: [' + n.tags.join(', ') + ']\n' : '') + '---\n\n' : ''; const a = h('a', { href: URL.createObjectURL(new Blob([fm + '# ' + n.title + '\n\n' + n.body], { type: 'text/markdown' })), download: (n.title || 'notatka').replace(/[^\w\-ąćęłńóśźż ]/gi, '').trim() + '.md' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#nRead', body).onclick = () => { const n = cur(); if (n) { const was = J.state.settings.speech; J.state.settings.speech = true; J.voice.speak(n.title + '. ' + n.body); J.state.settings.speech = was; } };
    $('#nRestore', body).onclick = async () => { const n = cur(); if (!n) return; const r = await J.uiRun('notes_restore', { note: n.id }); if (r.ok) { filter = { kind: 'all' }; renderAll(); } };
    $('#nPurge', body).onclick = async () => { const n = cur(); if (!n) return; if (await J.confirm('Usunąć „' + n.title + '” na zawsze? Tego nie da się cofnąć.')) { J.notes.remove(n.id); sel = J.notes.trashed()[0]?.id; renderAll(); } };
    $('#nEmpty', body).onclick = async () => { await J.uiRun('notes_empty_trash', {}); sel = null; renderAll(); };
    sub(ctx, 'notes', id => { if (id && J.state.notes.some(n => n.id === id && !n.deleted === !inTrash())) sel = id; if (!cur()) sel = visible()[0]?.id; if (document.activeElement !== bo && document.activeElement !== ti) renderAll(); else { renderFilters(); renderList(); } });
    ctx.state = () => { if (inTrash()) return { view: 'trash', target: null, label: 'Kosz' }; const n = cur(); return n ? { view: 'note', target: n.id, label: n.title, noteId: n.id, title: n.title, words: words(n) } : filter.kind === 'tag' ? { view: 'tag', target: filter.v, label: '#' + filter.v } : filter.kind === 'folder' ? { view: 'folder', target: filter.v, label: '📁 ' + filter.v } : null; };
    ctx.setQuery = v => { q = String(v || '').toLowerCase(); $('#nq', body).value = v || ''; renderList(); };
    ctx.setFilter = f => { filter = f; const l = visible(); if (!l.some(n => n.id === sel)) sel = l[0]?.id; renderAll(); };
    ctx.select = id => { const n = J.state.notes.find(x => x.id === id); if (!n) return; if (n.deleted && !inTrash()) filter = { kind: 'trash' }; else if (!n.deleted && inTrash()) filter = { kind: 'all' }; sel = id; renderAll(); flash(list.querySelector('[data-id="' + id + '"]')); };
    if (q) $('#nq', body).value = va.target;
    renderAll();
  },
  onArg(arg, ctx) {
    const v = viewOf(arg); if (!v) { if (typeof arg === 'string') ctx?.select?.(arg); return J.emit('app-view'); }
    if (v.view === 'search') ctx?.setQuery?.(v.target);
    else if (v.view === 'trash') ctx?.setFilter?.({ kind: 'trash' });
    else if (v.view === 'tag') ctx?.setFilter?.({ kind: 'tag', v: String(v.target || '').replace(/^#/, '') });
    else if (v.view === 'folder') ctx?.setFilter?.({ kind: 'folder', v: v.target });
    else if (v.target) ctx?.select?.(v.target);
    J.emit('app-view');
  },
  state: ctx => ctx?.state?.() || null
};

/* ---------- RYNEK ---------- */
J.apps.market = {
  title: 'Monitor rynku', icon: 'market', minW: 320, minH: 300, w: 440, h: 400,
  mount(body, ctx, arg) {
    body.innerHTML = `<div class="market" id="mk"></div><div class="src"><span id="mkSrc">Łączenie…</span><span class="dim" id="mkLive"></span></div>`;
    const grid = $('#mk', body), cards = {};
    const build = () => { grid.innerHTML = ''; Object.keys(cards).forEach(k => delete cards[k]); J.market.COINS.forEach(c => {
      const el = h('div', { class: 'coin' }, `<div class="h"><div><b>${esc(c.name)}</b><span class="sym">${esc(c.sym)}</span></div><span class="chg"></span></div><div class="price">—</div><canvas></canvas>`);
      grid.appendChild(el); cards[c.sym] = el;
    }); };
    build(); sub(ctx, 'market-list', () => { build(); draw(); });
    const draw = sym => {
      (sym ? [sym] : Object.keys(cards)).forEach(s => {
        const d = J.market.data[s], el = cards[s]; if (!el) return;
        const pr = $('.price', el); pr.textContent = J.fmtMoney(d.price);
        if (d.dir) { pr.classList.remove('flash-up', 'flash-down'); void pr.offsetWidth; pr.classList.add(d.dir > 0 ? 'flash-up' : 'flash-down'); clearTimeout(pr._t); pr._t = setTimeout(() => pr.classList.remove('flash-up', 'flash-down'), 500); d.dir = 0; }
        const ch = $('.chg', el); ch.textContent = (d.chg >= 0 ? '▲ +' : '▼ ') + d.chg.toFixed(2) + '%'; ch.className = 'chg ' + (d.chg >= 0 ? 'up' : 'down'); el.classList.toggle('sim', !d.live && /symulacja/.test(J.market.source)); el.title = d.live ? 'na żywo (Binance)' : /symulacja/.test(J.market.source) ? 'symulacja — brak połączenia' : 'CoinGecko (co minutę)';
        J.spark($('canvas', el), d.spark, d.chg >= 0 ? '#39e59a' : '#ff5d7a');
      });
      $('#mkSrc', body).textContent = 'Źródło: ' + J.market.source;
      $('#mkLive', body).textContent = /^Binance/.test(J.market.source) ? 'aktualizacja na żywo' : /CoinGecko/.test(J.market.source) ? 'odświeżanie co 90 s' : '';
    };
    sub(ctx, 'market', draw); sub(ctx, 'wm-resize', () => draw());
    J.market.subscribe(); ctx.onClose(() => J.market.unsubscribe());
    requestAnimationFrame(() => draw());
    let focusSym = null;
    ctx.showCoin = sym => { const k = String(sym || '').toUpperCase(); const el = cards[k]; if (!el) return false; focusSym = k; Object.values(cards).forEach(c => c.classList.toggle('sel', c === el)); flash(el); return true; };
    ctx.state = () => focusSym ? { view: 'coin', target: focusSym, label: focusSym } : null;
    const va = viewOf(arg); if (va?.view === 'coin') setTimeout(() => ctx.showCoin(va.target), 60);
  },
  onArg(arg, ctx) { const v = viewOf(arg); if (v?.view === 'coin') ctx?.showCoin?.(v.target); J.emit('app-view'); },
  state: ctx => ctx?.state?.() || null
};

/* ---------- HARMONOGRAM ---------- */
/* widoki: dzień (pasek 7 dni ze strzałkami), tydzień, zaległe; zadanie: priorytet (kropka), 🔁 powtarzanie, 📝 z notatki,
   🔔 przypomnienie, podzadania (rozwijane), przeciąganie na dzień w pasku, „Wyczyść zrobione”, eksport/import .ics */
J.apps.schedule = {
  title: 'Harmonogram', icon: 'calendar', minW: 360, minH: 380, w: 440, h: 520,
  mount(body, ctx, arg) {
    const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    const va = viewOf(arg); let day = isDay(arg) ? arg : isDay(va?.target) ? va.target : J.today(), view = va?.view === 'week' || va?.view === 'overdue' ? va.view : 'day', offset = 0;
    const open = new Set();
    body.innerHTML = `<div class="sch-top"><div class="seg" id="sv"><button data-v="day">Dzień</button><button data-v="week">Tydzień</button><button data-v="overdue">Zaległe</button></div><span class="sp"></span>
        <button class="btn sm ghost" id="sClr" title="Usuń zrobione zadania">Wyczyść zrobione</button><button class="btn sm ghost" id="sExp" title="Zapisz zadania jako .ics">.ics ↓</button></div>
      <div class="day-nav"><button class="btn sm ghost" id="dPrev" aria-label="Poprzednie dni">‹</button><div class="day-strip" id="days"></div><button class="btn sm ghost" id="dNext" aria-label="Następne dni">›</button></div>
      <form class="row" id="tf" style="margin-bottom:12px"><input class="input" type="time" id="tt" style="width:100px" aria-label="Godzina"><input class="input" id="tx" placeholder="Nowe zadanie… (pilne: …, codziennie)" required aria-label="Nowe zadanie"><button class="btn primary" aria-label="Dodaj">${icon('plus', 'width="13" height="13"')}</button></form>
      <div class="tasks" id="tl"></div>`;
    const days = $('#days', body), tl = $('#tl', body);
    const fmtDay = d => new Date(d + 'T12:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
    const plus = (d, k) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + k); return x.getFullYear() + '-' + J.pad(x.getMonth() + 1) + '-' + J.pad(x.getDate()); };
    const renderDays = () => {
      days.innerHTML = '';
      const base = plus(J.today(), offset * 7);
      for (let i = -1; i < 6; i++) {
        const key = plus(base, i), d = new Date(key + 'T12:00');
        const cnt = J.state.tasks.filter(t => t.date === key && !t.done).length;
        const b = h('button', { class: 'day' + (key === day && view === 'day' ? ' today' : '') + (key === J.today() ? ' is-today' : ''), 'data-day': key, title: fmtDay(key) }, `${d.toLocaleDateString('pl-PL', { weekday: 'short' })}<b>${d.getDate()}</b>${cnt ? '<span style="color:var(--accent)">• ' + cnt + '</span>' : '&nbsp;'}`);
        b.onclick = () => { day = key; view = 'day'; renderAll(); J.emit('app-view'); };
        /* przeciągnij zadanie na dzień = przenieś */
        b.ondragover = e => { e.preventDefault(); b.classList.add('drop'); };
        b.ondragleave = () => b.classList.remove('drop');
        b.ondrop = e => { e.preventDefault(); b.classList.remove('drop'); const id = e.dataTransfer.getData('text/x-task'), nid = e.dataTransfer.getData('text/x-note'); if (id) J.uiRun('tasks_update', { task: id, date: key }); else if (nid) J.uiRun('notes_to_task', { note: nid, date: key }); };
        days.appendChild(b);
      }
    };
    const rowOf = (t, nextId, showDate) => {
      const subs = t.subtasks || [], sd = subs.filter(x => x.done).length;
      const el = h('div', { class: 'task' + (t.done ? ' done' : '') + (t.id === nextId ? ' now' : '') + ' pr-' + (t.priority || 'normal'), draggable: 'true', 'data-id': t.id },
        `<input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Zrobione"><span class="t">${esc((showDate ? t.date.slice(5).replace('-', '.') + ' ' : '') + (t.time || '—'))}</span><span class="pdot" title="priorytet"></span><span class="n"></span><span class="ti"></span><button class="del" title="Usuń" aria-label="Usuń zadanie">×</button>`);
      $('.n', el).textContent = t.text;
      $('.ti', el).textContent = (t.repeat ? '🔁' : '') + (t.note ? '📝' : '') + (t.remind ? '🔔' : '') + (subs.length ? ' ' + sd + '/' + subs.length : '');
      $('.ti', el).title = [t.repeat ? 'powtarzane' : '', t.note ? 'z notatki (kliknij)' : '', t.remind ? 'przypomnienie ' + t.remind + ' min wcześniej' : '', subs.length ? 'podzadania' : ''].filter(Boolean).join(' · ');
      $('.pdot', el).onclick = () => J.uiRun('tasks_priority', { task: t.id, priority: { normal: 'high', high: 'low', low: 'normal' }[t.priority || 'normal'] });
      $('.pdot', el).title = 'Priorytet: ' + { high: 'wysoki', normal: 'zwykły', low: 'niski' }[t.priority || 'normal'] + ' (kliknij, by zmienić)';
      $('.ti', el).onclick = () => { if (t.note && !subs.length) return J.uiRun('app_view', { app: 'notes', view: 'note', target: t.note }, { quiet: true }); open.has(t.id) ? open.delete(t.id) : open.add(t.id); render(); };
      $('.n', el).ondblclick = () => { open.has(t.id) ? open.delete(t.id) : open.add(t.id); render(); };
      $('input', el).onchange = e => { J.uiRun('tasks_complete', { task: t.id, done: e.target.checked }, { offer: false }); };
      $('.del', el).onclick = () => J.uiRun('tasks_remove', { task: t.id });
      el.ondragstart = e => { e.dataTransfer.setData('text/x-task', t.id); e.dataTransfer.effectAllowed = 'move'; };
      const frag = document.createDocumentFragment(); frag.appendChild(el);
      if (open.has(t.id)) {
        const box = h('div', { class: 'subtasks' });
        subs.forEach(st => { const r = h('label', { class: 'sub' + (st.done ? ' done' : '') }, '<input type="checkbox"><span></span><button type="button" class="del" aria-label="Usuń podzadanie">×</button>'); $('input', r).checked = st.done; $('span', r).textContent = st.text; $('input', r).onchange = e => J.uiRun('tasks_subtask', { task: t.id, op: e.target.checked ? 'check' : 'uncheck', text: st.text }, { offer: false }); $('.del', r).onclick = e => { e.preventDefault(); J.uiRun('tasks_subtask', { task: t.id, op: 'remove', text: st.text }); }; box.appendChild(r); });
        const f = h('form', { class: 'row' }, '<input class="input" placeholder="Podzadanie…" maxlength="120"><button class="btn sm">+</button>');
        f.onsubmit = e => { e.preventDefault(); const v = $('input', f).value.trim(); if (v) J.uiRun('tasks_subtask', { task: t.id, op: 'add', text: v }, { offer: false }); };
        box.appendChild(f);
        const meta = h('div', { class: 'row sub-meta' }, '<select class="input" data-k="repeat" aria-label="Powtarzanie"><option value="none">bez powtarzania</option><option value="daily">codziennie</option><option value="weekdays">dni robocze</option><option value="weekly">co tydzień</option><option value="monthly">co miesiąc</option></select><select class="input" data-k="remind" aria-label="Przypomnienie"><option value="0">przypomnienie: o czasie</option><option value="5">5 min wcześniej</option><option value="15">15 min wcześniej</option><option value="30">30 min wcześniej</option><option value="60">godzinę wcześniej</option></select>');
        $('[data-k=repeat]', meta).value = t.repeat?.rule || 'none'; $('[data-k=remind]', meta).value = String(t.remind || 0);
        $('[data-k=repeat]', meta).onchange = e => J.uiRun('tasks_repeat', { task: t.id, rule: e.target.value });
        $('[data-k=remind]', meta).onchange = e => J.uiRun('tasks_update', { task: t.id, remind: +e.target.value });
        box.appendChild(meta);
        frag.appendChild(box);
      }
      return frag;
    };
    const render = () => {
      const now = J.hhmm(); tl.innerHTML = '';
      $$('#sv button', body).forEach(b => b.classList.toggle('on', b.dataset.v === view));
      const empty = text => { if (J.ui?.state) J.ui.state(tl, 'empty', { text }); else tl.innerHTML = '<div class="empty">' + esc(text) + '</div>'; };
      if (view === 'day') {
        const list = J.state.tasks.filter(t => t.date === day);
        if (!list.length) empty('Brak zadań na ' + (day === J.today() ? 'dziś' : fmtDay(day)) + '. Dodaj pierwsze powyżej albo powiedz: „przypomnij mi o 18:00 trening”.');
        const next = day === J.today() ? list.find(t => !t.done && t.time >= now)?.id : null;
        list.forEach(t => tl.appendChild(rowOf(t, next)));
      } else if (view === 'week') {
        const start = plus(J.today(), offset * 7); let any = false;
        for (let i = 0; i < 7; i++) { const d = plus(start, i), l = J.state.tasks.filter(t => t.date === d); if (!l.length) continue; any = true; const hd = h('div', { class: 'sch-day' + (d === J.today() ? ' is-today' : '') }); hd.textContent = fmtDay(d); hd.onclick = () => { day = d; view = 'day'; renderAll(); }; tl.appendChild(hd); l.forEach(t => tl.appendChild(rowOf(t))); }
        if (!any) empty('Brak zadań w tym tygodniu.');
      } else {
        const l = J.state.tasks.filter(t => !t.done && t.date < J.today());
        if (!l.length) empty('Nie masz zaległych zadań. 👍');
        else { const b = h('button', { class: 'btn sm', style: 'margin-bottom:8px' }, 'Przenieś wszystkie na dziś'); b.onclick = () => J.uiRun('tasks_move_many', { from: 'overdue', to: J.today() }); tl.appendChild(b); }
        l.forEach(t => tl.appendChild(rowOf(t, null, true)));
      }
    };
    const renderAll = () => { renderDays(); render(); };
    /* notatka upuszczona na listę = zadanie na oglądany dzień (przeciąganie między aplikacjami) */
    tl.ondragover = e => { if ([...(e.dataTransfer?.types || [])].includes('text/x-note')) { e.preventDefault(); tl.classList.add('drop'); } };
    tl.ondragleave = () => tl.classList.remove('drop');
    tl.ondrop = e => { tl.classList.remove('drop'); const nid = e.dataTransfer.getData('text/x-note'); if (nid) { e.preventDefault(); J.uiRun('notes_to_task', { note: nid, date: view === 'day' ? day : J.today() }); } };
    $$('#sv button', body).forEach(b => b.onclick = () => { view = b.dataset.v; renderAll(); J.emit('app-view'); });
    $('#dPrev', body).onclick = () => { offset--; renderDays(); if (view === 'week') render(); };
    $('#dNext', body).onclick = () => { offset++; renderDays(); if (view === 'week') render(); };
    $('#sClr', body).onclick = () => J.uiRun('tasks_clear_done', { range: view === 'day' && day === J.today() ? 'today' : view === 'week' ? 'week' : 'all' });
    $('#sExp', body).onclick = () => J.uiRun('tasks_export_ics', { range: view === 'week' ? 'week' : 'all' }, { offer: false });
    $('#tf', body).onsubmit = e => { e.preventDefault(); const tx = $('#tx', body), v = tx.value.trim(); if (!v) return; J.uiRun('add_task', { text: v, time: $('#tt', body).value || undefined, date: view === 'day' ? day : J.today() }, { offer: false }); tx.value = ''; J.sfx.click(); };
    sub(ctx, 'tasks', renderAll);
    const iv = setInterval(render, 30e3); ctx.onClose(() => clearInterval(iv));
    ctx.state = () => view === 'day' ? { view: 'day', target: day, day, label: fmtDay(day) } : { view, target: null, day, label: view === 'week' ? 'tydzień' : 'zaległe' };
    ctx.setDay = d => { if (isDay(d)) { day = d; view = 'day'; offset = 0; renderAll(); } };   // nawigacja: „pokaż piątek”
    ctx.setView = v => { if (v === 'week' || v === 'overdue') { view = v; renderAll(); } };
    // import kalendarza .ics (VEVENT → zadania, RRULE → powtarzanie)
    const imp = h('label', { class: 'btn sm ghost', style: 'cursor:pointer;margin-left:auto', title: 'Importuj wydarzenia z pliku .ics' }, icon('download', 'width="12" height="12"') + ' .ics<input type="file" accept=".ics,text/calendar" hidden>');
    $('#tf', body).appendChild(imp);
    $('input[type=file]', imp).onchange = async e => { const f = e.target.files[0]; if (!f) return; const n = J.ics.import(await f.text()); J.toast(n ? 'Zaimportowano ' + n + ' ' + J.pl(n, 'wydarzenie', 'wydarzenia', 'wydarzeń') : 'Brak wydarzeń w pliku'); };
    renderAll();
  },
  onArg(arg, ctx) { const v = viewOf(arg); if (v?.view === 'week' || v?.view === 'overdue') ctx?.setView?.(v.view); else ctx?.setDay?.(v ? v.target : arg); J.emit('app-view'); },
  state: ctx => ctx?.state?.() || null
};

/* ---------- import kalendarza (.ics, VEVENT z DTSTART i SUMMARY) ---------- */
J.ics = {
  parse(text) {
    const out = [], lines = String(text).replace(/\r\n[ \t]/g, '').split(/\r?\n/); let ev = null;
    for (const l of lines) {
      if (l === 'BEGIN:VEVENT') ev = {}; else if (l === 'END:VEVENT') { if (ev?.start && ev.summary) out.push(ev); ev = null; }
      else if (ev) { const i = l.indexOf(':'); if (i < 0) continue; const key = l.slice(0, i).split(';')[0], val = l.slice(i + 1); if (key === 'SUMMARY') ev.summary = val.replace(/\\,/g, ',').replace(/\\n/g, ' '); else if (key === 'DTSTART') { const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(val); if (m) ev.start = { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] ? m[4] + ':' + m[5] : '' }; } else if (key === 'RRULE') ev.repeat = J.ics.rrule(val); }
    }
    return out;
  },
  import(text) { const l = J.ics.parse(text); let n = 0; l.forEach(ev => { if (J.state.tasks.some(t => t.date === ev.start.date && t.text === ev.summary)) return; J.tasks.add(ev.start.time, ev.summary, ev.start.date, ev.repeat ? { repeat: ev.repeat } : {}); n++; }); return n; },
  /* RRULE ⇄ reguła powtarzania zadania (FREQ=DAILY|WEEKLY|MONTHLY, BYDAY, INTERVAL, UNTIL) */
  DAYS: { pn: 'MO', wt: 'TU', sr: 'WE', cz: 'TH', pt: 'FR', so: 'SA', nd: 'SU' },
  rrule(val) {
    const p = {}; String(val).split(';').forEach(kv => { const [k, v] = kv.split('='); if (k) p[k.toUpperCase()] = v || ''; });
    const inv = Object.fromEntries(Object.entries(J.ics.DAYS).map(([a, b]) => [b, a])), until = /^(\d{4})(\d{2})(\d{2})/.exec(p.UNTIL || ''), iv = parseInt(p.INTERVAL || '1', 10) || 1;
    const days = (p.BYDAY || '').split(',').map(d => inv[d.replace(/^[+-]?\d+/, '')]).filter(Boolean);
    let r = null;
    if (p.FREQ === 'DAILY') r = iv > 1 ? { rule: 'every_n_days', n: iv } : { rule: 'daily' };
    else if (p.FREQ === 'WEEKLY') r = days.length === 5 && !days.includes('so') && !days.includes('nd') ? { rule: 'weekdays' } : iv > 1 ? { rule: 'every_n_days', n: iv * 7 } : { rule: 'weekly', ...(days.length ? { days } : {}) };
    else if (p.FREQ === 'MONTHLY') r = { rule: 'monthly' };
    if (r && until) r.until = until[1] + '-' + until[2] + '-' + until[3];
    return r;
  },
  toRrule(r) {
    if (!r || r.rule === 'none') return '';
    const u = r.until ? ';UNTIL=' + r.until.replace(/-/g, '') + 'T235959Z' : '';
    if (r.rule === 'daily') return 'FREQ=DAILY' + u;
    if (r.rule === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' + u;
    if (r.rule === 'weekly') return 'FREQ=WEEKLY' + (r.days?.length ? ';BYDAY=' + r.days.map(d => J.ics.DAYS[d]).join(',') : '') + u;
    if (r.rule === 'monthly') return 'FREQ=MONTHLY' + u;
    if (r.rule === 'every_n_days') return 'FREQ=DAILY;INTERVAL=' + (r.n || 2) + u;
    return '';
  },
  /* eksport zadań do .ics (RFC 5545; zadania z godziną = 30 min, bez godziny = całodniowe) */
  export(list) {
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jarvis OS//PL', 'CALSCALE:GREGORIAN'];
    (list || []).forEach(t => {
      const d = t.date.replace(/-/g, ''); L.push('BEGIN:VEVENT', 'UID:' + t.id + '@jarvis-os', 'DTSTAMP:' + stamp);
      if (t.time) { const [hh, mm] = t.time.split(':').map(Number), e = hh * 60 + mm + 30, ed = e >= 1440; const endT = String(Math.floor((e % 1440) / 60)).padStart(2, '0') + String(e % 60).padStart(2, '0'); L.push('DTSTART:' + d + 'T' + t.time.replace(':', '') + '00', 'DTEND:' + (ed ? (() => { const x = new Date(t.date + 'T12:00'); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ''); })() : d) + 'T' + endT + '00'); }
      else { const x = new Date(t.date + 'T12:00'); x.setDate(x.getDate() + 1); L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + x.toISOString().slice(0, 10).replace(/-/g, '')); }
      L.push(fold('SUMMARY:' + esc(t.text)));
      const rr = J.ics.toRrule(t.repeat); if (rr) L.push('RRULE:' + rr);
      if (t.done) L.push('STATUS:COMPLETED');
      if (t.priority === 'high') L.push('PRIORITY:1');
      if (t.remind && t.time) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(t.text), 'TRIGGER:-PT' + t.remind + 'M', 'END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR'); return L.join('\r\n') + '\r\n';
  }
};

/* ---------- MONITOR SYSTEMU ---------- */
J.apps.monitor = {
  title: 'Monitor systemu', icon: 'monitor', minW: 340, minH: 320, w: 440, h: 470,
  onArg(arg, ctx) { const v = viewOf(arg); if (v?.view === 'section') ctx?.goSection?.(v.target); },
  mount(body, ctx, arg) {
    ctx.goSection = sec => { const id = { jarvis: 'jAct', koszt: 'jHer', jev: 'jJev', fps: 'sFps', klatki: 'sFps', pamiec: 'sMem', pamięć: 'sMem', siec: 'sNet', sieć: 'sNet', dane: 'sSto', bateria: 'sBat', okna: 'sWin' }[J.norm(sec || '')] || 'sFps'; flash($('#' + id, body)?.closest('.stat')); };
    setTimeout(() => { const va = viewOf(arg); if (va?.view === 'section') ctx.goSection(va.target); }, 80);
    body.innerHTML = `<div class="stats">
      <div class="stat wide"><span>Klatki / s</span><strong id="sFps">—</strong><canvas id="cFps"></canvas></div>
      <div class="stat"><span>Pamięć JS</span><strong id="sMem">—</strong><canvas id="cMem"></canvas></div>
      <div class="stat"><span>Opóźnienie pętli</span><strong id="sLag">—</strong><canvas id="cLag"></canvas></div>
      <div class="stat"><span>Czas pracy</span><strong id="sUp">—</strong></div>
      <div class="stat"><span>Rdzenie CPU</span><strong>${navigator.hardwareConcurrency || '?'}</strong></div>
      <div class="stat"><span>Sieć</span><strong id="sNet">—</strong></div>
      <div class="stat"><span>Bateria</span><strong id="sBat">—</strong></div>
      <div class="stat"><span>Okna / akcje</span><strong id="sWin">—</strong></div>
      <div class="stat"><span>Dane lokalne</span><strong id="sSto">—</strong></div>
    </div>
    <div class="label" style="margin-top:14px">Jarvis</div>
    <div class="stats" id="sJar">
      <div class="stat"><span>Akcje dziś</span><strong id="jAct">—</strong></div>
      <div class="stat"><span>Hermes dziś</span><strong id="jHer">—</strong></div>
      <div class="stat"><span>Jev (miesiąc)</span><strong id="jJev">—</strong></div>
      <div class="stat"><span>Jev — stan</span><strong id="jBrk">—</strong></div>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn sm ghost" id="jDiag">Kopiuj diagnostykę (JSON, bez kluczy)</button></div>`;
    const hist = { fps: [], mem: [], lag: [] };
    let bat = null; navigator.getBattery?.().then(b => bat = b).catch(() => { });
    let last = performance.now();
    const tick = () => {
      const now = performance.now(), lag = Math.max(0, now - last - 1000); last = now;
      const fps = J.fps || 0;
      hist.fps.push(fps); hist.lag.push(lag);
      const mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
      if (mem != null) hist.mem.push(mem);
      for (const k in hist) if (hist[k].length > 60) hist[k].shift();
      $('#sFps', body).textContent = fps;
      $('#sMem', body).textContent = mem != null ? mem.toFixed(1) + ' MB' : 'n/d';
      $('#sLag', body).textContent = lag.toFixed(0) + ' ms';
      const up = (Date.now() - J.bootTime) / 1000;
      $('#sUp', body).textContent = Math.floor(up / 3600) + 'h ' + J.pad(Math.floor(up % 3600 / 60)) + 'm ' + J.pad(Math.floor(up % 60)) + 's';
      const cn = navigator.connection;
      $('#sNet', body).textContent = navigator.onLine ? (cn?.effectiveType ? cn.effectiveType.toUpperCase() + (cn.downlink ? ' · ' + cn.downlink + 'Mb' : '') : 'ONLINE') : 'OFFLINE';
      $('#sBat', body).textContent = bat ? Math.round(bat.level * 100) + '%' + (bat.charging ? ' ⚡' : '') : 'n/d';
      $('#sWin', body).textContent = J.wm.count() + ' / ' + (J.state.stats.actions || 0);
      let bytes = 0; try { bytes = (localStorage.getItem('jarvis-os:v2') || '').length * 2; } catch (e) { }
      $('#sSto', body).textContent = (bytes / 1024).toFixed(1) + ' KB';
      J.spark($('#cFps', body), hist.fps, accent());
      J.spark($('#cMem', body), hist.mem, J.state.settings.accent2);
      J.spark($('#cLag', body), hist.lag, '#ffb84d');
      /* sekcja Jarvis: akcje dziś, koszt Hermesa dziś, Jev w miesiącu, bezpiecznik */
      const dd = (J.state.stats.daily || {})[J.today()] || {}, hd = J.state.stats.hermesDay?.d === J.today() ? J.state.stats.hermesDay : { calls: 0, cost: 0 };
      $('#jAct', body).textContent = dd.actions || 0;
      $('#jHer', body).textContent = hd.calls + ' · $' + (+hd.cost || 0).toFixed(4);
      $('#jJev', body).textContent = J.judge ? J.judge.budget.calls() + ' · $' + (+J.judge.budget.used() || 0).toFixed(4) : 'n/d';
      $('#jBrk', body).textContent = !J.judge?.enabled?.() ? 'wyłączony' : J.judge.breaker.open ? 'pauza: ' + (J.judge.breaker.reason || '') : J.judge.status.state;
    };
    $('#jDiag', body).onclick = async () => { const d = { app: 'Jarvis OS', ts: new Date().toISOString(), ua: navigator.userAgent, fps: J.fps, windows: J.wm.info().map(w => w.id), stats: { actions: J.state.stats.actions, daily: J.state.stats.daily, hermesDay: J.state.stats.hermesDay }, jev: J.judge ? { state: J.judge.status.state, calls: J.judge.status.calls, lastError: J.judge.status.lastError, breaker: J.judge.breaker.open ? J.judge.breaker.reason : null } : null, hermes: { on: !!J.state.settings.hermesOn, status: J.hermes?.status }, checks: J.diagnostics ? (await J.diagnostics()).map(([ok, n, info]) => ({ ok, n, info })) : [] }; const t = JSON.stringify(d, null, 1); navigator.clipboard?.writeText(t).then(() => J.toast('Skopiowano diagnostykę'), () => J.toast('Nie udało się skopiować')); };
    tick(); const iv = setInterval(tick, 1000); ctx.onClose(() => clearInterval(iv));
  }
};

/* ---------- POGODA ---------- */
J.apps.weather = {
  title: 'Pogoda', icon: 'weather', minW: 320, minH: 300, w: 440, h: 400,
  mount(body, ctx, arg) {
    body.innerHTML = `<form class="row" id="wf" style="margin-bottom:14px"><input class="input" id="wc" placeholder="Miasto…"><button class="btn">Szukaj</button><button class="btn ghost" type="button" id="wg" title="Moja lokalizacja">📍</button></form><div id="wo"><div class="empty">Pobieram prognozę…</div></div>`;
    const out = $('#wo', body);
    const show = d => {
      const c = d.current, [ico, txt] = J.wxInfo(c.weather_code), dl = d.daily;
      out.innerHTML = `<div class="wx-now"><div class="wx-big">${ico}</div><div><div class="wx-temp">${Math.round(c.temperature_2m)}°</div><div class="muted">${esc(d.city)} · ${txt}</div></div>
        <div style="margin-left:auto;text-align:right;font-size:11px;line-height:1.8" class="muted">Odczuwalna <b style="color:#fff">${Math.round(c.apparent_temperature)}°</b><br>Wiatr <b style="color:#fff">${Math.round(c.wind_speed_10m)} km/h</b><br>Wilgotność <b style="color:#fff">${c.relative_humidity_2m}%</b></div></div>
        <div class="wx-days">${dl.time.slice(1, 6).map((t, i) => { const k = i + 1; return `<div class="wx-day">${new Date(t).toLocaleDateString('pl-PL', { weekday: 'short' })}<div class="i">${J.wxInfo(dl.weather_code[k])[0]}</div><b>${Math.round(dl.temperature_2m_max[k])}°</b> <span class="dim">${Math.round(dl.temperature_2m_min[k])}°</span><div class="dim" style="margin-top:3px">💧${dl.precipitation_probability_max[k] ?? 0}%</div></div>`; }).join('')}</div>
        ${d.hourly?.time ? `<div class="wx-hours">${d.hourly.time.map((t, i) => `<div><small>${t.slice(11, 16)}</small><i>${J.wxInfo(d.hourly.weather_code?.[i])[0]}</i><b>${Math.round(d.hourly.temperature_2m[i])}°</b></div>`).join('')}</div>` : ''}
        <div class="src"><span>Wschód ${dl.sunrise[0].slice(11)} · Zachód ${dl.sunset[0].slice(11)}</span><span>Open-Meteo${d.stale ? ' · dane z ' + new Date(d.fetched).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`;
      if (d.stale) J.ui?.state(out, 'stale', { text: 'nieaktualne — brak sieci' });
      /* ulubione miasta (maks. 5) */
      const fav = J.state.settings.favCities || [], isFav = fav.some(c => J.norm(c) === J.norm(d.city));
      const fb = h('div', { class: 'wx-fav' }); fav.forEach(c => { const b = h('button', { class: 'chip' }); b.textContent = c; b.onclick = () => ctx.body._load(c); fb.appendChild(b); });
      const star = h('button', { class: 'chip', title: isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych' }); star.textContent = isFav ? '★ ' + d.city : '☆ dodaj ' + d.city; star.onclick = () => { const l = J.state.settings.favCities = (J.state.settings.favCities || []).filter(c => J.norm(c) !== J.norm(d.city)); if (!isFav) { l.unshift(d.city); l.length = Math.min(l.length, 5); } J.save(); show(d); }; fb.appendChild(star); out.prepend(fb);
    };
    const load = async city => {
      if (J.ui?.state) J.ui.state(out, 'loading', { text: 'Pobieram prognozę…' }); else out.innerHTML = '<div class="empty">Pobieram prognozę…</div>';
      try { show(await J.weather.get(city)); } catch (e) { if (J.ui?.state) J.ui.state(out, navigator.onLine === false || J.state.settings.offlineMode ? 'offline' : 'error', { text: navigator.onLine === false ? 'Brak internetu — pogoda wróci, gdy połączenie wróci.' : (e.message || 'Nie udało się pobrać pogody.'), action: { label: 'Spróbuj ponownie', run: () => load(city) } }); else out.innerHTML = '<div class="empty">' + esc(e.message || 'Brak połączenia z serwisem pogody') + '</div>'; }
    };
    $('#wf', body).onsubmit = e => { e.preventDefault(); const v = $('#wc', body).value.trim(); if (v) load(v); };
    $('#wg', body).onclick = () => {
      if (!navigator.geolocation) return J.toast('Geolokalizacja niedostępna');
      navigator.geolocation.getCurrentPosition(async p => {
        const s = J.state.settings; s.lat = p.coords.latitude; s.lon = p.coords.longitude; s.city = 'Moja lokalizacja'; J.save();
        try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${s.lat}&lon=${s.lon}`); const j = await r.json(); s.city = j.address?.city || j.address?.town || j.address?.village || s.city; J.save(); } catch (e) { }
        J.weather.ts = 0; load(); J.toast('Ustawiono lokalizację: ' + s.city + ' (nazwę miejscowości podaje OpenStreetMap)');
      }, () => J.toast('Brak zgody na lokalizację'));
    };
    let cityNow = null;
    const load0 = load; ctx.body._load = c => { cityNow = c || null; return load0(c); };
    ctx.state = () => cityNow ? { view: 'city', target: cityNow, label: cityNow } : null;
    const va = viewOf(arg); ctx.body._load(typeof arg === 'string' ? arg : va?.view === 'city' ? va.target : undefined);
  },
  onArg(arg, ctx) { const v = viewOf(arg); ctx.body._load?.(v ? v.target : arg); J.emit('app-view'); },
  state: ctx => ctx?.state?.() || null
};

/* ---------- TERMINAL ---------- */
J.apps.terminal = {
  title: 'Terminal', icon: 'terminal', minW: 380, minH: 220, w: 560, h: 380, flush: true,
  onArg(arg, ctx) { const v = viewOf(arg); if (v?.view === 'run') ctx?.prefill?.(v.target); },
  mount(body, ctx, arg) {
    body.innerHTML = `<div class="term"><div class="term-out" id="to"></div><div class="term-in"><span>jarvis@os:~$</span><input id="ti" autocomplete="off" spellcheck="false"></div></div>`;
    const out = $('#to', body), inp = $('#ti', body), hist = []; let hi = 0;
    const print = (html, cls = '') => { const d = h('div', { class: cls }, html); out.appendChild(d); out.scrollTop = out.scrollHeight; };
    const run = async line => { print('<span class="g">jarvis@os:~$</span> ' + esc(line)); if (line.trim().toLowerCase() === 'clear') { out.innerHTML = ''; return; } const r = await TERM.run(line, print); if (r) print(r); };
    const cmdNames = Object.keys(TERM.cmds);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const v = inp.value; if (v.trim()) { hist.push(v); hi = hist.length; } inp.value = ''; run(v); }
      else if (e.key === 'ArrowUp') { if (hi > 0) inp.value = hist[--hi]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { inp.value = hi < hist.length - 1 ? hist[++hi] : (hi = hist.length, ''); }
      else if (e.key === 'Tab') { e.preventDefault(); const m = cmdNames.filter(k => k.startsWith(inp.value)); if (m.length === 1) inp.value = m[0] + ' '; else if (m.length) print('<span class="d">' + m.join('  ') + '</span>'); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.innerHTML = ''; }
    });
    body.addEventListener('click', () => { if (!String(window.getSelection?.() || '')) inp.focus(); });   // nie kradnij zaznaczenia — użytkownik kopiuje wynik
    print('<span class="c">Jarvis OS 2.1</span> — terminal. Wpisz <span class="c">help</span>, aby zobaczyć polecenia.');
    ctx.prefill = t => { inp.value = String(t || ''); inp.focus(); };   // tylko wpisuje — wykonanie wymaga Enter
    ctx.dirty = () => !!inp.value.trim();
    const va = viewOf(arg); if (va?.view === 'run') ctx.prefill(va.target);
    setTimeout(() => inp.focus(), 60);
  }
};
/* polecenia terminala: wspólne dla okna Terminala i narzędzia terminal_run (zwracają HTML) */
const TERM = (() => {
    let print = () => { };
    const cmds = {
      help: a => a ? (() => { const c = J.registry.get(a.trim()) || J.registry.list().find(x => J.norm(x.label) === J.norm(a)); if (!c) return print('<span class="e">nie znam polecenia „' + esc(a) + '”</span> — spróbuj help (lista terminala) albo nazwy z rejestru, np. help add_task'); const props = Object.entries(c.args.properties || {}); print('<span class="c">' + esc(c.id) + '</span> — ' + esc(c.label) + '\n' + esc(c.description) + (props.length ? '\n<span class="d">argumenty:</span> ' + props.map(([k, v]) => esc(k) + ((c.args.required || []).includes(k) ? '*' : '') + (v.enum ? '=' + esc(v.enum.join('|')) : '')).join(', ') : '') + ((c.examples || []).length ? '\n<span class="d">przykłady:</span> ' + c.examples.slice(0, 3).map(esc).join(' · ') : '') + '\n<span class="d">ryzyko:</span> ' + esc(c.risk) + (c.undoable ? ' · da się cofnąć' : '')); })() : print(`<span class="c">Dostępne polecenia:</span> <span class="d">(help &lt;polecenie&gt; — opis polecenia rejestru, np. help add_task)</span>
  help            ta lista            open &lt;app&gt;     otwórz aplikację
  ls / apps       lista aplikacji     close &lt;app|all&gt; zamknij okno
  note &lt;tekst&gt;     nowa notatka        task HH:MM &lt;t&gt;  nowe zadanie
  calc &lt;wyr&gt;      kalkulator          timer &lt;min&gt;     minutnik
  weather [miasto] pogoda             crypto          kursy krypto
  theme &lt;kolor&gt;    zmień akcent        say &lt;tekst&gt;      powiedz na głos
  ask &lt;pytanie&gt;    zapytaj Jarvisa     neofetch        informacje o systemie
  date / whoami   data / użytkownik   matrix          ;)
  clear           wyczyść             reboot          restart systemu`),
      ls: () => print(Object.entries(J.apps).map(([k, a]) => `<span class="c">${k.padEnd(10)}</span> ${esc(a.title)}`).join('\n')),
      apps: () => cmds.ls(),
      open: a => J.wm.open(a) ? print('<span class="g">✓</span> otwarto ' + esc(a)) : print('<span class="e">nie ma aplikacji: ' + esc(a) + '</span> (wpisz ls)'),
      close: a => { if (a === 'all') { J.wm.closeAll(); print('<span class="g">✓</span> zamknięto wszystkie okna'); } else if (J.wm.isOpen(a)) { J.wm.close(a); print('<span class="g">✓</span> zamknięto ' + esc(a)); } else print('<span class="e">okno nie jest otwarte</span>'); },
      note: t => { if (!t) return print('<span class="e">użycie: note &lt;tekst&gt;</span>'); J.notes.add(t.slice(0, 40), t); J.action('note'); print('<span class="g">✓</span> notatka zapisana'); },
      task: t => { const m = /^(\d{1,2}[:.]\d{2})\s+(.+)$/.exec(t || ''); if (!m) return print('<span class="e">użycie: task 18:00 trening</span>'); J.tasks.add(m[1], m[2]); J.action('task'); print('<span class="g">✓</span> zadanie dodane'); },
      calc: e => { try { print('<span class="v">= ' + J.calc(e) + '</span>'); } catch (er) { print('<span class="e">' + esc(er.message) + '</span>'); } },
      timer: m => { const n = parseFloat(m); if (!(n > 0)) return print('<span class="e">użycie: timer 5</span>'); J.timer.start(Math.round(n * 60)); J.action('timer'); print('<span class="g">✓</span> minutnik: ' + n + ' min'); },
      weather: async c => { print('<span class="d">pobieram…</span>'); try { print(esc(J.weather.describe(await J.weather.get(c || undefined)))); } catch (e) { print('<span class="e">' + esc(e.message) + '</span>'); } },
      crypto: async () => { await J.market.ensure(); print(J.market.COINS.map(c => { const d = J.market.data[c.sym]; return `<span class="c">${c.sym.padEnd(4)}</span> ${J.fmtMoney(d.price).padStart(12)}  <span class="${d.chg >= 0 ? 'g' : 'e'}">${(d.chg >= 0 ? '+' : '') + d.chg.toFixed(2)}%</span>`; }).join('\n')); },
      theme: c => { const t = J.THEMES[(c || '').toLowerCase()]; if (!t) return print('dostępne: ' + Object.keys(J.THEMES).join(', ')); J.state.settings.accent = t[0]; J.state.settings.accent2 = t[1]; J.applyTheme(); J.save(); J.emit('settings'); print('<span class="g">✓</span> motyw: ' + esc(c)); },
      say: t => { const was = J.state.settings.speech; J.state.settings.speech = true; J.voice.speak(t); J.state.settings.speech = was; },
      ask: q => { J.wm.open('chat', q); print('<span class="d">→ czat</span>'); },
      date: () => print(new Date().toLocaleString('pl-PL', { dateStyle: 'full', timeStyle: 'medium' })),
      whoami: () => print(esc(J.state.settings.user) + ' · administrator środowiska Jarvis'),
      echo: t => print(esc(t)),
      clear: () => { },
      matrix: () => J.matrix?.(),
      reboot: () => { print('<span class="c">restart…</span>'); setTimeout(() => location.reload(), 600); },
      neofetch: () => print(`<span class="c">     ◢◤◥◣      </span> <b>jarvis</b>@<b>os</b>
<span class="c">   ◢◤ ◉◉ ◥◣    </span> ─────────────
<span class="c">  ◢◤ ◉  ◉ ◥◣   </span> <span class="c">OS</span>: Jarvis OS 2.1 (web)
<span class="c">  ◥◣ ◉  ◉ ◢◤   </span> <span class="c">Silnik</span>: ${esc(J.aiReady() ? 'Hermes · ' + J.state.settings.hermesModel : 'lokalny')}
<span class="c">   ◥◣ ◉◉ ◢◤    </span> <span class="c">Okna</span>: ${J.wm.count()} · <span class="c">Notatki</span>: ${J.state.notes.length}
<span class="c">     ◥◣◢◤      </span> <span class="c">Rozdzielczość</span>: ${innerWidth}×${innerHeight}
                  <span class="c">Akcje</span>: ${J.state.stats.actions || 0} · <span class="c">CPU</span>: ${navigator.hardwareConcurrency || '?'} rdzeni`)
    };
    const api = {
      cmds,
      async run(line, out) {
        print = out || (() => { });
        const [c, ...rest] = line.trim().split(/\s+/); const arg = rest.join(' ');
        if (!c) return '';
        const fn = cmds[c.toLowerCase()];
        if (!fn) return '<span class="e">nieznane polecenie: ' + esc(c) + '</span> — wpisz <span class="c">help</span>';
        await fn(arg); return '';
      }
    };
    return api;
})();
J.terminalRun = async line => { const buf = []; const r = await TERM.run(line, html => buf.push(html)); if (r) buf.push(r); return buf.join('\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); };

/* ---------- KALKULATOR ---------- */
J.apps.calc = {
  title: 'Kalkulator', icon: 'calc', minW: 260, minH: 380, aspect: .68, w: 300, h: 440,
  onArg(arg, ctx) { const v = viewOf(arg); if (v?.view === 'expr') ctx?.setExpr?.(v.target); },
  mount(body, ctx, arg) {
    let expr = '';
    body.innerHTML = `<div class="calc-disp"><button class="calc-hb" id="chB" title="Historia obliczeń" aria-label="Historia obliczeń">⟲</button><div class="expr" id="ce"></div><div class="res" id="cr" title="Kliknij, aby skopiować wynik">0</div></div><div class="calc-hist" id="chL" hidden></div><div class="calc-keys" id="ck"></div>`;
    /* historia 20 wyników (klik = wstaw wynik), kopiowanie wyniku kliknięciem */
    const hist = () => (J.state.ui.calcHist = J.state.ui.calcHist || []);
    const drawHist = () => { const l = $('#chL', body); l.innerHTML = ''; if (!hist().length) l.appendChild(h('div', { class: 'empty' }, 'Brak obliczeń.')); hist().forEach(x => { const b = h('button', { class: 'calc-hi' }, '<small></small><b></b>'); b.querySelector('small').textContent = x.e + ' ='; b.querySelector('b').textContent = x.r; b.onclick = () => { expr += String(x.r); show(); l.hidden = true; }; l.appendChild(b); }); };
    $('#chB', body).onclick = () => { const l = $('#chL', body); l.hidden = !l.hidden; if (!l.hidden) drawHist(); };
    $('#cr', body).onclick = () => { const t = $('#cr', body).textContent; navigator.clipboard?.writeText(t).then(() => J.toast('Skopiowano: ' + t), () => { }); };
    const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', ',', '='];
    const map = { '÷': '/', '×': '*', '−': '-', ',': '.' };
    const ck = $('#ck', body);
    keys.forEach(k => { const b = h('button', { class: (/[÷×−+%()]/.test(k) ? 'op' : '') + (k === '=' ? ' eq' : '') }, k); b.onclick = () => press(k); ck.appendChild(b); });
    const show = () => { $('#ce', body).textContent = expr; try { $('#cr', body).textContent = expr ? J.calc(expr) : '0'; } catch (e) { } };
    const press = k => {
      J.sfx.click();
      if (k === 'C') expr = '';
      else if (k === '=') { try { const r = J.calc(expr); J.log('Obliczenie', expr + ' = ' + r); if (expr && String(r) !== expr) { hist().unshift({ e: expr, r }); hist().length = Math.min(hist().length, 20); J.save(); } expr = String(r); } catch (e) { $('#cr', body).textContent = 'Błąd'; return; } }
      else if (k === '⌫') expr = expr.slice(0, -1);
      else expr += map[k] || k;
      show();
    };
    const onKey = e => {
      if (!J.wm.isFocused('calc') || e.target.closest('input,textarea')) return;
      if (/^[\d+\-*/().%^]$/.test(e.key)) { expr += e.key; show(); }
      else if (e.key === 'Enter' || e.key === '=') press('=');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Escape') { /* obsługiwane globalnie */ }
      else if (e.key === ',') { expr += '.'; show(); }
      else if (e.key.toLowerCase() === 'c') press('C');
    };
    addEventListener('keydown', onKey); ctx.onClose(() => removeEventListener('keydown', onKey));
    ctx.setExpr = v => { expr = String(v || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.'); show(); };
    const va = viewOf(arg); if (va?.view === 'expr') ctx.setExpr(va.target);
  }
};

/* ---------- MINUTNIK / STOPER ---------- */
J.apps.timer = {
  title: 'Minutnik', icon: 'timer', minW: 280, minH: 360, w: 340, h: 470,
  onArg(arg, ctx) { const v = viewOf(arg); if (v) ctx?.setMode?.(v.view === 'stopwatch' ? 'sw' : 'timer'); J.emit('app-view'); },
  state: ctx => ctx?.state?.() || null,
  mount(body, ctx, arg) {
    let mode = 'timer', swStart = 0, swAcc = 0, swRun = false, laps = [];
    const C = 2 * Math.PI * 76;
    body.innerHTML = `<div class="seg"><button data-m="timer" class="on">Minutnik</button><button data-m="sw">Stoper</button></div>
      <div id="tv"></div>`;
    const tv = $('#tv', body);
    const drawTimer = () => {
      tv.innerHTML = `<div class="timer-ring"><svg viewBox="0 0 170 170"><circle class="bg" cx="85" cy="85" r="76"/><circle class="fg" id="tfg" cx="85" cy="85" r="76" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div><div class="timer-disp" id="td">05:00</div><div class="dim" style="text-align:center;font-size:10px" id="tl"></div></div></div>
        <div class="chips">${[1, 3, 5, 10, 15, 25, 45, 60].map(m => `<button class="chip" data-min="${m}">${m} min</button>`).join('')}</div>
        <div class="row"><input class="input" id="tmin" type="number" min="0.1" step="0.5" placeholder="min" style="width:80px"><input class="input" id="tlab" placeholder="Etykieta (opcjonalnie)"></div>
        <div class="row" style="margin-top:10px;justify-content:center"><button class="btn primary" id="tgo">Start</button><button class="btn ghost" id="tpau">Pauza</button><button class="btn ghost" id="tstop">Stop</button><button class="btn ghost" id="tpomo" title="Pomodoro: 25 min pracy, 5 min przerwy ×4">🍅</button></div>
        <div class="tm-list" id="tml"></div>`;
      const lab = () => $('#tlab', tv).value.trim();
      $$('.chip', tv).forEach(b => b.onclick = () => { J.uiRun('start_timer', { seconds: +b.dataset.min * 60, label: lab() || 'Minutnik ' + b.dataset.min + ' min' }, { offer: false }); J.action('timer'); });
      $('#tgo', tv).onclick = () => { const m = parseFloat($('#tmin', tv).value); if (!(m > 0)) return J.toast('Podaj liczbę minut'); J.uiRun('start_timer', { seconds: Math.round(m * 60), label: lab() || 'Minutnik' }, { offer: false }); J.action('timer'); };
      $('#tstop', tv).onclick = () => { if (J.timer.running) J.uiRun('timer_control', { action: 'stop', label: J.timer.label }, { offer: false }); };
      $('#tpau', tv).onclick = () => { if (J.timer.running) J.uiRun('timer_control', { action: J.timer.paused ? 'resume' : 'pause', label: J.timer.label }, { offer: false }); };
      $('#tpomo', tv).onclick = () => J.uiRun('start_timer', { preset: 'pomodoro' }, { offer: false });
      upTimer();
    };
    const upTimer = () => {
      if (mode !== 'timer') return;
      const td = $('#td', tv); if (!td) return;
      const t = J.timer, left = t.running ? t.left() : 0;
      td.textContent = t.running ? t.fmt(left) : '00:00';
      $('#tl', tv).textContent = t.running ? t.label : 'wybierz czas';
      $('#tfg', tv).setAttribute('stroke-dashoffset', t.running && t.total ? C * (1 - left / t.total) : 0);
      const pb = $('#tpau', tv); if (pb) { pb.textContent = t.paused ? 'Wznów' : 'Pauza'; pb.disabled = !t.running; }
      /* pozostałe minutniki (maks. 5 naraz) */
      const ml = $('#tml', tv), others = J.timers.all().filter(x => x !== J.timer); if (!ml) return;
      const sig = others.map(x => x.id + x.paused).join();
      if (ml.dataset.sig !== sig) { ml.dataset.sig = sig; ml.innerHTML = ''; others.forEach(x => { const r = h('div', { class: 'tm-row', 'data-id': x.id }, '<b></b><span class="tm-left"></span><button class="btn sm ghost" data-a="p"></button><button class="btn sm ghost danger" data-a="s" aria-label="Zatrzymaj">×</button>'); r.querySelector('b').textContent = x.label; $('[data-a=p]', r).textContent = x.paused ? '▶' : '❚❚'; $('[data-a=p]', r).onclick = () => J.uiRun('timer_control', { action: x.paused ? 'resume' : 'pause', label: x.label }, { offer: false }); $('[data-a=s]', r).onclick = () => J.uiRun('timer_control', { action: 'stop', label: x.label }, { offer: false }); ml.appendChild(r); }); }
      others.forEach(x => { const el = ml.querySelector('[data-id="' + x.id + '"] .tm-left'); if (el) el.textContent = x.fmt(x.left()); });
    };
    const swTime = () => swAcc + (swRun ? Date.now() - swStart : 0);
    const swFmt = ms => J.pad(Math.floor(ms / 60000)) + ':' + J.pad(Math.floor(ms / 1000) % 60) + '.' + J.pad(Math.floor(ms / 10) % 100);
    const drawSw = () => {
      tv.innerHTML = `<div class="timer-disp" id="sd" style="margin:40px 0 20px">00:00.00</div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="ss">${swRun ? 'Pauza' : 'Start'}</button><button class="btn ghost" id="sl">Okrążenie</button><button class="btn ghost" id="sr">Reset</button></div>
        <div class="tasks" id="laps" style="margin-top:14px"></div>`;
      $('#ss', tv).onclick = () => { if (swRun) { swAcc += Date.now() - swStart; swRun = false; } else { swStart = Date.now(); swRun = true; } $('#ss', tv).textContent = swRun ? 'Pauza' : 'Start'; };
      $('#sl', tv).onclick = () => { if (!swRun) return; laps.unshift(swTime()); renderLaps(); };
      $('#sr', tv).onclick = () => { swAcc = 0; swRun = false; laps = []; $('#ss', tv).textContent = 'Start'; renderLaps(); };
      renderLaps();
    };
    const renderLaps = () => { const l = $('#laps', tv); if (l) l.innerHTML = laps.map((t, i) => `<div class="task"><span class="t">#${laps.length - i}</span><span class="n" style="font-family:var(--mono)">${swFmt(t)}</span></div>`).join(''); };
    const raf = () => { if (!alive) return; if (mode === 'sw') { const sd = $('#sd', tv); if (sd) sd.textContent = swFmt(swTime()); } requestAnimationFrame(raf); };
    let alive = true; ctx.onClose(() => alive = false);
    const setMode = m => { mode = m; $$('.seg button', body).forEach(x => x.classList.toggle('on', x.dataset.m === m)); mode === 'timer' ? drawTimer() : drawSw(); J.emit('app-view'); };
    $$('.seg button', body).forEach(b => b.onclick = () => setMode(b.dataset.m));
    sub(ctx, 'timer', upTimer);
    ctx.setMode = setMode;
    ctx.state = () => ({ view: mode === 'sw' ? 'stopwatch' : 'timer', label: mode === 'sw' ? 'stoper' : 'minutnik' });
    drawTimer(); raf();
    const va = viewOf(arg); if (va?.view === 'stopwatch') ctx.setMode('sw');
  }
};

/* ---------- BIBLIOTEKA APLIKACJI ---------- */
J.apps.library = {
  title: 'Biblioteka środowiska', icon: 'apps', minW: 380, minH: 320, w: 480, h: 480,
  onArg(arg, ctx) { const v = viewOf(arg); if (v) ctx?.goView?.(v.view); },
  mount(body, ctx, arg) {
    ctx.goView = v => setTimeout(() => flash($(v === 'shortcut' || v === 'shortcuts' ? '#sf' : '#ag', body)), 60);
    { const va = viewOf(arg); if (va) ctx.goView(va.view); }
    const ids = ['chat', 'notes', 'market', 'schedule', 'weather', 'monitor', 'terminal', 'calc', 'timer', 'files', 'settings'];
    body.innerHTML = `<div class="appgrid" id="ag"></div>
      <div class="label" style="margin-top:18px">Skróty na pulpicie</div><div class="sc-list" id="scl"></div>
      <div class="label" style="margin-top:12px" id="sfl">Utwórz skrót na pulpicie</div>
      <form class="col" id="sf"><div class="row"><input class="input" id="sn" placeholder="Nazwa (np. GitHub)" required maxlength="40"><select class="input" id="sa" style="width:150px"><option value="">— link URL —</option>${ids.map(i => `<option value="${i}">${esc(J.apps[i].title)}</option>`).join('')}</select></div>
      <div class="row"><input class="input" id="su" placeholder="https://…"><button class="btn primary" id="sfb">${icon('plus', 'width="12" height="12"')} Dodaj</button><button type="button" class="btn ghost" id="sfc" hidden>Anuluj</button></div></form>`;
    const ag = $('#ag', body), scl = $('#scl', body), form = $('#sf', body);
    ids.forEach(i => { const a = J.apps[i]; if (!a) return; const b = h('button', {}, `<div class="appico">${icon(a.icon)}</div><span></span>`); b.querySelector('span').textContent = a.title.replace('Czat z Jarvisem', 'Czat').replace('Biblioteka środowiska', 'Aplikacje'); b.onclick = () => { J.wm.open(i); }; ag.appendChild(b); });
    let editing = null;
    const resetForm = () => { editing = null; form.reset(); $('#su', body).disabled = false; $('#sfl', body).textContent = 'Utwórz skrót na pulpicie'; $('#sfb', body).innerHTML = icon('plus', 'width="12" height="12"') + ' Dodaj'; $('#sfc', body).hidden = true; };
    const renderSc = () => {
      scl.innerHTML = '';
      if (!J.state.shortcuts.length) { scl.appendChild(h('div', { class: 'empty' }, 'Brak skrótów. Dodaj pierwszy poniżej.')); return; }
      J.state.shortcuts.forEach(sc => {
        const r = h('div', { class: 'sc-row' }, '<b></b><small></small><span class="sp"></span><button class="btn sm ghost" data-a="e">Edytuj</button><button class="btn sm ghost danger" data-a="x" aria-label="Usuń skrót">×</button>');
        r.querySelector('b').textContent = sc.name; r.querySelector('small').textContent = sc.url || (sc.app ? J.APP_NAMES[sc.app] : '—');
        $('[data-a=e]', r).onclick = () => { editing = sc.id; $('#sn', body).value = sc.name; $('#sa', body).value = sc.app || ''; $('#su', body).value = sc.url || ''; $('#su', body).disabled = !!sc.app; $('#sfl', body).textContent = 'Edytuj skrót „' + sc.name + '”'; $('#sfb', body).textContent = 'Zapisz'; $('#sfc', body).hidden = false; flash(form); $('#sn', body).focus(); };
        $('[data-a=x]', r).onclick = () => J.uiRun('shortcut_remove', { name: sc.id });
        scl.appendChild(r);
      });
    };
    $('#sa', body).onchange = e => { $('#su', body).disabled = !!e.target.value; };
    $('#sfc', body).onclick = resetForm;
    form.onsubmit = async e => {
      e.preventDefault();
      const name = $('#sn', body).value.trim(), app = $('#sa', body).value; let url = $('#su', body).value.trim();
      if (!app && !url) return J.toast('Podaj adres URL lub wybierz aplikację');
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      const r = editing ? await J.uiRun('shortcut_edit', { shortcut: editing, name, ...(app ? { app } : { url }) }) : await J.uiRun('add_shortcut', { name, ...(app ? { app } : { url }) });
      if (r.ok) { if (!editing) J.toast('Jarvis umieścił „' + name + '” na pulpicie'); resetForm(); }
    };
    sub(ctx, 'shortcuts', renderSc); renderSc();
  }
};

/* ---------- PLIKI (folder roboczy; bez File System Access — podgląd pliku z dysku, tylko do odczytu) ---------- */
const FILE_MAX = 512 * 1024, IMG = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i, TXT = /\.(txt|md|markdown|json|csv|tsv|log|js|ts|css|html?|xml|ya?ml|ini|py|sh|ics)$/i;
const renderCsv = (text, sep) => { const rows = text.split(/\r?\n/).filter(Boolean).slice(0, 200).map(l => l.split(sep)); const t = h('table', { class: 'fl-csv' }); rows.forEach((r, i) => { const tr = h('tr'); r.forEach(c => { const td = h(i ? 'td' : 'th'); td.textContent = c.replace(/^"|"$/g, ''); tr.appendChild(td); }); t.appendChild(tr); }); return t; };
J.filePreview = async (box, file, name) => {
  box.innerHTML = ''; name = name || file.name;
  const head = h('div', { class: 'fl-ph' }); head.textContent = name + ' · ' + (file.size < 1024 ? file.size + ' B' : Math.round(file.size / 1024) + ' KB'); box.appendChild(head);
  if (IMG.test(name) && !/\.svg$/i.test(name)) { const u = URL.createObjectURL(file); const im = h('img', { class: 'fl-img', alt: name, src: u }); im.onload = () => setTimeout(() => URL.revokeObjectURL(u), 1000); box.appendChild(im); return 'image'; }
  if (file.size > FILE_MAX) { box.appendChild(h('div', { class: 'empty' }, 'Plik jest za duży na podgląd (limit 512 KB).')); return 'too_big'; }
  if (!TXT.test(name) && file.type && !/^text\/|json|xml|svg/.test(file.type)) { box.appendChild(h('div', { class: 'empty' }, 'Tego typu pliku nie da się podejrzeć.')); return 'unsupported'; }
  const text = await file.text();
  if (/\.(md|markdown)$/i.test(name)) { const d = h('div', { class: 'md fl-md' }); d.innerHTML = J.md(text); box.appendChild(d); return 'markdown'; }
  if (/\.json$/i.test(name)) { const pre = h('pre', { class: 'fl-pre' }); try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { pre.textContent = text; } box.appendChild(pre); return 'json'; }
  if (/\.(csv|tsv)$/i.test(name)) { box.appendChild(renderCsv(text, /\.tsv$/i.test(name) ? '\t' : (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ','))); return 'csv'; }
  const pre = h('pre', { class: 'fl-pre' }); pre.textContent = text; box.appendChild(pre); return 'text';
};
J.apps.files = {
  title: 'Pliki', icon: 'folder', minW: 420, minH: 300, w: 640, h: 440, flush: true,
  mount(body, ctx, arg) {
    let path = '', selFile = null;
    body.innerHTML = `<div class="files"><div class="fl-bar"><button class="btn sm ghost" id="flUp" title="Folder wyżej" aria-label="Folder wyżej">↑</button><span class="fl-path" id="flPath"></span><span class="sp"></span>
      <button class="btn sm ghost" id="flRef" title="Odśwież">⟳</button><button class="btn sm" id="flPick">Wybierz folder</button><label class="btn sm ghost" title="Podgląd pliku z dysku (tylko odczyt)">Otwórz plik…<input type="file" id="flOne" hidden></label></div>
      <div class="fl-main"><div class="fl-list" id="flList"></div><div class="fl-prev" id="flPrev"></div></div></div>`;
    const list = $('#flList', body), prev = $('#flPrev', body);
    const empty = (el, text) => { if (J.ui?.state) J.ui.state(el, 'empty', { text }); else el.innerHTML = '<div class="empty">' + esc(text) + '</div>'; };
    const render = async () => {
      $('#flPath', body).textContent = (J.files.handle ? J.files.handle.name : 'brak folderu') + (path ? ' / ' + path.split('/').join(' / ') : '');
      $('#flUp', body).disabled = !path;
      if (!J.files.supported) { empty(list, 'Ta przeglądarka nie daje dostępu do folderów (potrzebny Chrome lub Edge). Możesz podejrzeć pojedynczy plik przyciskiem „Otwórz plik…”.'); $('#flPick', body).hidden = true; return; }
      if (!J.files.handle) await J.files.load();
      if (!J.files.handle) { empty(list, 'Nie wybrano folderu roboczego. Kliknij „Wybierz folder”.'); return; }
      try {
        const l = await J.files.list(path); list.innerHTML = '';
        if (!l.length) empty(list, 'Folder jest pusty.');
        l.forEach(f => {
          const b = h('button', { class: 'fl-item' + (f.kind === 'directory' ? ' dir' : '') + (selFile === (path ? path + '/' : '') + f.name ? ' sel' : ''), 'data-name': f.name }); b.textContent = (f.kind === 'directory' ? '📁 ' : IMG.test(f.name) ? '🖼 ' : '📄 ') + f.name;
          b.onclick = () => f.kind === 'directory' ? go((path ? path + '/' : '') + f.name) : show((path ? path + '/' : '') + f.name);
          list.appendChild(b);
        });
      } catch (e) { if (J.ui?.state) J.ui.state(list, 'error', { text: e.message, retry: render }); else list.textContent = e.message; }
    };
    const go = p => { path = J.files.split(p).join('/'); selFile = null; prev.innerHTML = ''; render(); J.emit('app-view'); };
    const show = async p => {
      try { const f = await J.files.file(p); selFile = p; await J.filePreview(prev, f, p.split('/').pop()); const dirp = J.files.split(p).slice(0, -1).join('/'); if (dirp !== path) { path = dirp; } render(); J.emit('app-view'); }
      catch (e) { prev.innerHTML = ''; prev.appendChild(h('div', { class: 'empty' }, (e.name === 'NotFoundError' ? 'Nie ma pliku „' + p + '”.' : e.message))); }
    };
    ctx.open = async p => { if (!p) return; if (!J.files.supported || !(J.files.handle || await J.files.load())) { prev.innerHTML = ''; prev.appendChild(h('div', { class: 'empty' }, 'Brak dostępu do folderu roboczego — nie mogę otworzyć „' + p + '”.')); return; } try { await J.files.dir(p); go(p); } catch (e) { show(p); } };
    $('#flUp', body).onclick = () => go(path.split('/').slice(0, -1).join('/'));
    $('#flRef', body).onclick = render;
    $('#flPick', body).onclick = async () => { try { await J.files.pick(); path = ''; render(); } catch (e) { if (e.name !== 'AbortError') J.toast(e.message); } };
    $('#flOne', body).onchange = async e => { const f = e.target.files[0]; if (f) { selFile = null; await J.filePreview(prev, f); } };
    ctx.state = () => ({ view: 'path', target: selFile || path || null, label: selFile || path || 'folder roboczy' });
    sub(ctx, 'files', render);
    const va = viewOf(arg); render().then(() => { if (va?.target) ctx.open(va.target); });
  },
  onArg(arg, ctx) { const v = viewOf(arg); if (v?.target) ctx?.open?.(v.target); J.emit('app-view'); },
  state: ctx => ctx?.state?.() || null
};
})();
