/* =========================================================
   JARVIS OS — aplikacja Ustawienia (wydzielona z apps.js: ~300 linii, największy pojedynczy fragment)
   Ładowana po apps.js; korzysta z usług zdefiniowanych tam (J.weather, J.market, J.notes…).
   ========================================================= */
'use strict';
(() => {
const { $, $$, h, esc, icon } = J;
const sub = (ctx, ev, fn) => ctx.onClose(J.on(ev, fn));
const viewOf = arg => arg && typeof arg === 'object' ? arg : null;

/* ---------- USTAWIENIA ---------- */
J.apps.settings = {
  title: 'Ustawienia', icon: 'settings', minW: 380, minH: 420, w: 460, h: 560,
  onArg(arg, ctx) { const v = viewOf(arg); ctx?.goSection?.(v ? v.target : arg); J.emit('app-view'); },
  state: ctx => ctx?.state?.() || null,
  mount(body, ctx, arg) {
    const s = J.state.settings;
    const walls = [['photo', 'Miasto nocą', "url('assets/wallpaper.jpg')"], ['aurora', 'Aurora', 'linear-gradient(135deg,#1b1147,#0b3b5a)'], ['void', 'Pustka', 'radial-gradient(circle,#0a1a30,#01040a)']];
    body.innerHTML = `
      <div class="label">OpenRouter · jeden klucz dla mózgu i sędziego ${icon('key', 'width="11" height="11" style="vertical-align:-1px"')}</div>
      <div class="card col or-card">
        <div class="row"><input class="input" id="orKey" type="password" placeholder="Wklej klucz OpenRouter (sk-or-v1-…)" autocomplete="off" spellcheck="false"><button class="btn sm ghost" id="orEye" title="Pokaż / ukryj">👁</button></div>
        <label class="toggle" style="padding-top:2px"><div>Mózg: Hermes 4 przez OpenRouter<small>Model <code>nousresearch/hermes-4-70b</code> (natywne tool_calls), zamiast lokalnego Hermes Agent</small></div><span class="switch"><input type="checkbox" id="orBrain"><i></i></span></label>
        <label class="toggle"><div>Sędzia: Jev (TypeSafe „System One”)<small>Intencja, ryzyko, dwuznaczność, weryfikacja w ~200 ms</small></div><span class="switch"><input type="checkbox" id="orJudge"><i></i></span></label>
        <div class="row"><button class="btn primary" id="orTest">Zapisz i testuj</button><a class="btn ghost" href="https://openrouter.ai/keys" target="_blank" rel="noopener">Pobierz klucz</a><button class="btn ghost danger" id="orDel" style="margin-left:auto">Usuń</button></div>
        <div class="dim" id="orInfo" style="font-size:10.5px;line-height:1.55"></div>
      </div>
      <div class="label">Kolor akcentu</div><div class="swatches" id="sw"></div>
      <div class="label">Tapeta</div><div class="walls" id="wl"></div>
      <div class="label">Interfejs</div>
      <label class="toggle"><div>Cząsteczki i sieć neuronowa<small>Animowane tło reagujące na kursor</small></div><span class="switch"><input type="checkbox" data-k="particles"><i></i></span></label>
      <label class="toggle"><div>Dźwięki interfejsu<small>Syntezowane efekty audio</small></div><span class="switch"><input type="checkbox" data-k="sound"><i></i></span></label>
      <label class="toggle"><div>Jarvis mówi na głos<small>Odpowiedzi odczytywane syntezatorem mowy</small></div><span class="switch"><input type="checkbox" data-k="speech"><i></i></span></label>
      <label class="toggle"><div>Pomiń animację startową<small>Szybsze uruchamianie</small></div><span class="switch"><input type="checkbox" data-k="skipBoot"><i></i></span></label>
      <div class="row" style="font-size:11.5px"><span style="flex:1">Skala interfejsu<small class="dim" id="usV" style="margin-left:6px"></small></span><input type="range" id="uiScale" min="80" max="130" step="5" style="width:170px"></div>
        <label class="toggle"><div>Minimapa okien<small>mały podgląd pulpitu w rogu; klik = przejście do okna</small></div><span class="switch"><input type="checkbox" data-k="minimap"><i></i></span></label>
        <div class="row" style="font-size:11.5px"><span style="flex:1">Efekty<small class="dim" id="fxNow" style="display:block;font-size:10px"></small></span><select class="input" id="fxLvl" style="width:150px"><option value="off">bez animacji</option><option value="tool">oszczędne</option><option value="standard">standardowe</option><option value="cinema">kinowe</option></select></div>
        <div class="row" style="font-size:11.5px"><span style="flex:1">Głośność dźwięków<small class="dim" id="volV" style="margin-left:6px"></small><small class="dim" style="display:block;font-size:10px">wyciszone w ciszy nocnej i w trybie prezentacji (poza alarmem minutnika)</small></span><input type="range" id="sVol" min="0" max="100" step="5" style="width:170px"></div>
      <div class="label">Film · moduł scenariuszy</div>
      <label class="toggle"><div>Film włączony<small>wyłącznik modułu: bez propozycji i samoczynnego włączania (ręczne „pokaż film” zawsze działa)</small></div><span class="switch"><input type="checkbox" data-k="filmOn"><i></i></span></label>
      <div id="filmScen"></div>
      <div class="row" style="font-size:11.5px"><span style="flex:1">Tryb startowy przestrzeni</span><select class="input" id="startMode" style="width:170px"><option value="work">praca (okna)</option><option value="clean">czysty pulpit</option><option value="focus">skupienie</option></select></div>
      <label class="toggle"><div>Tryb bez sieci<small>Żadnych wywołań internetu (Hermes, Jev, pogoda, kursy) — działa parser i dane lokalne</small></div><span class="switch"><input type="checkbox" data-k="offlineMode"><i></i></span></label>
      <div class="label">Głos</div><select class="input" id="vs"></select>
      <div class="row" style="font-size:11.5px"><span style="flex:1">Tempo mowy</span><input type="range" id="spRate" min="0.7" max="1.5" step="0.05" style="width:150px"></div>
      <div class="row" style="font-size:11.5px"><span style="flex:1">Język rozpoznawania mowy</span><select class="input" id="sttLang" style="width:150px"><option value="pl-PL">polski</option><option value="en-US">angielski</option></select></div>
      <div class="label">Użytkownik</div><div class="row"><input class="input" id="un" maxlength="3" placeholder="Inicjały" style="width:90px"><input class="input" id="city" placeholder="Miasto (pogoda)"><button class="btn" id="cityGo">Zapisz</button></div>
      <div class="label">Hermes · Nous Research ${icon('key', 'width="11" height="11" style="vertical-align:-1px"')}</div>
      <div class="card col">
        <label class="toggle" style="padding-top:0"><div>Mózg Jarvisa: Hermes<small>Wyłączone = tylko lokalny silnik poleceń</small></div><span class="switch"><input type="checkbox" id="hOn"><i></i></span></label>
        <select class="input" id="hProv">${Object.entries(J.HERMES_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')}</select>
        <input class="input" id="hUrl" placeholder="Adres API, np. http://localhost:8642/v1" spellcheck="false">
        <div class="row"><input class="input" id="hModel" placeholder="Model" list="hModels" spellcheck="false"><datalist id="hModels"></datalist><button class="btn ghost" id="hList" title="Pobierz listę modeli">${icon('refresh', 'width="12" height="12"')}</button></div>
        <input class="input" id="hKey" type="password" placeholder="Klucz API (API_SERVER_KEY / Nous Portal; dla OpenRouter zostaw puste — użyty będzie klucz z sekcji OpenRouter)" autocomplete="off">
        <div class="row"><button class="btn primary" id="hTest">Połącz i testuj</button><button class="btn ghost danger" id="hDel">Usuń klucz</button></div>
        <div class="dim" id="hInfo" style="font-size:10.5px;line-height:1.5"></div>
        <div class="muted" id="hHelp" style="font-size:10.5px;line-height:1.55"></div>
        <div class="row" style="font-size:11.5px"><span style="flex:1">Koszt odpowiedzi<small class="dim" style="display:block;font-size:10px">tani = lżejszy model zawsze · zrównoważony = lżejszy tylko do rozmowy · najlepszy = zawsze główny</small></span><select class="input" id="hPreset" style="width:150px"><option value="cheap">tani</option><option value="balanced">zrównoważony</option><option value="max">najlepszy</option></select></div>
        <div class="row" style="font-size:11.5px"><span style="flex:1">Dzienny limit (USD, OpenRouter; 0 = bez)<small class="dim" id="hDayUsed" style="display:block;font-size:10px"></small></span><input class="input" id="hDaily" type="number" min="0" max="50" step="0.1" style="width:80px"></div>
      </div>
      <div class="label">Most pulpitu dla Hermesa (MCP)</div>
      <div class="card col">
        <label class="toggle" style="padding-top:0"><div>Most włączony<small>Hermes steruje pulpitem natywnymi narzędziami MCP z Command Registry (bez parsowania tekstu)</small></div><span class="switch"><input type="checkbox" id="bOn"><i></i></span></label>
        <input class="input" id="bUrl" placeholder="Adres mostu, np. http://127.0.0.1:8651" spellcheck="false">
        <input class="input" id="bTok" type="password" placeholder="Token mostu (pobierany automatycznie po uruchomieniu mostu)" autocomplete="off">
        <select class="input" id="hMode"><option value="auto">Tryb Hermesa: automatyczny (MCP, gdy profil używa mostu)</option><option value="mcp">Zawsze MCP (natywne narzędzia)</option><option value="prompt">Zawsze prompt (narzędzia w treści zapytania)</option></select>
        <div class="row"><button class="btn primary" id="bConn">Połącz / odśwież</button></div>
        <div class="dim" id="bInfo" style="font-size:10.5px;line-height:1.5"></div>
        <div class="muted" style="font-size:10.5px;line-height:1.55">Most: <code>bridge\\start-bridge.bat</code>. Profil Hermesa <code>jarvis-desktop</code>: <code>hermes\\install-profile.ps1</code>, gateway: <code>hermes\\start-desktop-gateway.bat</code> (opis w README).</div>
      </div>
      <div class="label">Agent i proaktywność</div>
      <div class="card col">
        <label class="toggle" style="padding-top:0"><div>Czuwanie ze słowem „Jarvis”<small>Nasłuch ciągły: powiedz „Jarvis, …” (Chrome / Edge)</small></div><span class="switch"><input type="checkbox" id="aWake"><i></i></span></label>
        <label class="toggle"><div>Cichy tryb głosowy<small>Polecenia głosowe nie otwierają panelu czatu</small></div><span class="switch"><input type="checkbox" data-k="silentVoice"><i></i></span></label>
        <div class="row"><div style="flex:1;font-size:12px">Proaktywność<small class="dim" style="display:block;font-size:10px">cicha = sygnały w następnej rozmowie · aktywna = Jarvis sam zaczyna rozmowę</small></div><select class="input" id="aPro" style="width:130px"><option value="quiet">cicha</option><option value="active">aktywna</option></select></div>
        <div class="row"><div style="flex:1;font-size:12px">Cisza nocna<small class="dim" style="display:block;font-size:10px">bez aktywnych sygnałów i rutyn</small></div><input class="input" type="time" id="aQf" style="width:100px"><span class="dim">–</span><input class="input" type="time" id="aQt" style="width:100px"></div>
        <div class="row"><div style="flex:1;font-size:12px">Poranny briefing<small class="dim" style="display:block;font-size:10px">pogoda, zadania, alerty (wymaga Hermesa)</small></div><input class="input" type="time" id="aBr" style="width:100px"><button class="btn sm ghost" id="aBrNow" title="Uruchom teraz">▶</button></div>
        <div class="row"><div style="flex:1;font-size:12px">Podsumowanie dnia</div><input class="input" type="time" id="aSu" style="width:100px"><button class="btn sm ghost" id="aSuNow" title="Uruchom teraz">▶</button></div>
        <div class="row"><div style="flex:1;font-size:12px">Format narzędzi Hermesa<small class="dim" style="display:block;font-size:10px">auto wykrywa przy „Połącz i testuj”</small></div><select class="input" id="aFmt" style="width:130px"><option value="auto">auto</option><option value="hermes">&lt;tool_call&gt;</option><option value="openai">tool_calls</option></select></div>
        <div class="row"><div style="flex:1;font-size:12px">Zawsze dozwolone bez pytania<small class="dim" id="aAllow" style="display:block;font-size:10px"></small></div><button class="btn sm ghost" id="aAllowClr">Wyczyść</button></div>
        <div class="row" style="margin-top:6px"><div style="flex:1;font-size:12px">Rutyny<small class="dim" style="display:block;font-size:10px">kroki po kolei; kroki wymagające zgody pytają zawsze · maks. 30 rutyn, 12 kroków</small></div></div>
        <div id="rtList" class="col"></div>
        <form class="row" id="rtForm"><input class="input" id="rtNew" placeholder="np. zrób rutynę poranek: pogoda, zadania na dziś i układ praca" maxlength="300"><button class="btn sm primary">Utwórz</button></form>
      </div>
      <div class="label">Sędzia Jev · OpenRouter ${icon('bolt', 'width="11" height="11" style="vertical-align:-1px"')}</div>
      <div class="card col">
        <label class="toggle" style="padding-top:0"><div>Decyzje przez Jev (TypeSafe „System One”)<small>Intencja, ryzyko, dwuznaczność, weryfikacja odpowiedzi, pilność sygnałów — w ~200 ms, ułamki centa</small></div><span class="switch"><input type="checkbox" id="jvOn"><i></i></span></label>
        <input class="input" id="jvKey" type="password" placeholder="Klucz OpenRouter (sk-or-v1-…)" autocomplete="off">
        <div class="row"><select class="input" id="jvModel">${J.judge.MODELS.map(m => `<option value="${m}">${m}</option>`).join('')}</select><button class="btn primary" id="jvTest">Połącz i testuj</button></div>
        <div class="row" style="font-size:11px"><span style="flex:1">Wykonaj bez pytania od</span><input class="input" id="jvExec" type="number" min="0.5" max="1" step="0.05" style="width:80px"><span style="flex:1;text-align:right">Zapytaj od</span><input class="input" id="jvAsk" type="number" min="0.1" max="1" step="0.05" style="width:80px"></div>
        <div class="row" style="font-size:11px"><span style="flex:1">Co wysyłać do Jeva (prywatność)</span><select class="input" id="jvPrivacy" style="width:210px"><option value="P0">P0 · tylko Twoje zdanie</option><option value="P1">P1 · + aplikacje, okna, dzisiejsze zadania</option><option value="P2">P2 · + tytuły notatek i profil</option></select></div>
        <div class="row" style="font-size:11px"><span style="flex:1">Samodzielność Jeva</span><select class="input" id="jvAuto" style="width:210px"><option value="auto">odczyty i cofalne zapisy — sam</option><option value="reads">tylko odczyty — sam</option><option value="ask">zawsze pytaj „Chodzi o…?”</option></select></div>
        <div class="row" style="font-size:11px"><span style="flex:1">Odczyty sam od</span><input class="input" id="jvA3" type="number" min="0.5" max="1" step="0.05" style="width:80px"><span style="flex:1;text-align:right">Zapisy z „Cofnij” od</span><input class="input" id="jvA2" type="number" min="0.5" max="1" step="0.01" style="width:80px"></div>
        <div class="row" style="font-size:11px"><span style="flex:1">Budżet miesięczny (USD, 0 = bez limitu)</span><input class="input" id="jvBudget" type="number" min="0" max="100" step="0.5" style="width:80px"></div>
        <div class="row" style="font-size:11px"><span style="flex:1">Lżejszy model dla zwykłej rozmowy<small class="dim" style="display:block;font-size:10px">puste = ten sam co mózg</small></span><input class="input" id="jvLite" placeholder="np. nousresearch/hermes-4-70b" style="width:210px"></div>
        <label class="toggle"><div>Szybka ścieżka<small>Pewne odczyty i nawigację wykonuje parser bez czekania na Jeva</small></div><span class="switch"><input type="checkbox" id="jvFast"><i></i></span></label>
        <label class="toggle"><div>Tryb cienia<small>Jev tylko liczy i zapisuje wynik do dziennika; niczego nie zmienia (do porównania z parserem)</small></div><span class="switch"><input type="checkbox" id="jvShadow"><i></i></span></label>
        <label class="toggle"><div>Zapisuj treść zdań w dzienniku<small>Domyślnie tylko skrót zdania. Dziennik zostaje w tej przeglądarce</small></div><span class="switch"><input type="checkbox" id="jvLogText"><i></i></span></label>
        <div class="row"><button class="btn sm ghost" id="jvExport">${icon('download', 'width="12" height="12"')} Dziennik decyzji</button><button class="btn sm ghost" id="jvResetAdapt" title="Wyzerowuj podniesione progi po odrzuceniach">Zresetuj uczenie się</button><button class="btn sm ghost danger" id="jvClearLog">Wyczyść dziennik</button></div>
        <div class="dim" id="jvStats" style="font-size:10.5px;line-height:1.6"></div>
        <div class="dim" id="jvInfo" style="font-size:10.5px;line-height:1.5"></div>
      </div>
      <div class="label">Powiadomienia</div>
      <div class="card col" id="ntBox"><div class="dim" style="font-size:10.5px">Wyłączony kanał trafia tylko do centrum powiadomień (bez dymka i dźwięku). Limit = ile dymków na godzinę.</div><div id="ntList" class="col"></div></div>
      <div class="label">Skróty klawiszowe</div>
      <div class="card col"><div class="dim" style="font-size:10.5px">Kliknij pole i naciśnij nową kombinację (z Ctrl albo Alt). Esc — anuluj. Skróty przeglądarki są zablokowane.</div><div id="kbList" class="col"></div><div class="row"><button class="btn sm ghost" id="kbReset">Przywróć domyślne skróty</button></div></div>
      <div class="label">Układy okien</div>
      <div class="card col"><div class="row" style="font-size:11.5px"><span style="flex:1">Układ przy starcie</span><select class="input" id="layStart" style="width:170px"></select></div><div id="layList" class="col"></div><div class="row"><button class="btn sm ghost" id="laySave">Zapisz bieżący układ…</button></div></div>
      <div class="label">Pamięć Jarvisa</div>
      <div class="card col" id="memBox"><div class="dim" style="font-size:10.5px">Fakty zapamiętane poleceniem „zapamiętaj, że…” trafiają do kontekstu każdej rozmowy.</div><div id="memList" class="col"></div></div>
      <div class="label">Folder roboczy (pliki)</div>
      <div class="card col"><div class="row"><span id="fsInfo" class="dim" style="flex:1;font-size:11px"></span><button class="btn sm" id="fsPick">Wybierz folder</button><button class="btn sm ghost" id="fsPerm" title="Odśwież uprawnienia">Odśwież dostęp</button></div></div>
      <div class="label">Dane</div>
      <div class="row"><button class="btn ghost" id="exp">${icon('download', 'width="12" height="12"')} Eksportuj</button><label class="btn ghost" style="cursor:pointer">Importuj<input type="file" id="imp" accept=".json" hidden></label><button class="btn ghost danger" id="rst" style="margin-left:auto">Resetuj wszystko</button></div>
      <div class="card col" style="margin-top:8px"><div class="row" style="font-size:11.5px"><b style="flex:1">Co jest zapisane w tej przeglądarce</b><button class="btn sm ghost" id="stoRefresh">Odśwież</button></div><div id="stoList" class="col" style="font-size:11px"></div></div>
      <div class="label">O programie</div>
      <div class="card col">
        <div style="font-size:11.5px">Jarvis OS 2.1 · specyfikacja i plan: <code>docs/spec</code></div>
        <div class="row"><button class="btn sm primary" id="diagRun">Testy diagnostyczne</button><button class="btn sm ghost" id="tourRun">Pokaż samouczek</button><button class="btn sm ghost" id="keysShow">Skróty (?)</button></div>
        <div id="diagOut" class="col" style="font-size:11px"></div>
        <label class="toggle"><div>Nakładka diagnostyczna<small>Alt Shift D: pakiet kontekstu, ostatnia decyzja Jeva, FPS, stos „Cofnij”</small></div><span class="switch"><input type="checkbox" id="dbgOverlay"><i></i></span></label>
        <div class="dim" style="font-size:10.5px">Eksperymenty (flagi funkcji) — wyłącz funkcję, jeśli sprawia kłopot:</div><div id="flagList" class="col"></div>
      </div>
      <div class="dim" style="font-size:10px;margin-top:14px;text-align:center">Jarvis OS 2.1 · <kbd>Ctrl K</kbd> paleta · <kbd>Ctrl Spacja</kbd> głos · <kbd>?</kbd> wszystkie skróty · <kbd>Esc</kbd> zamknij</div>`;
    /* nawigacja po sekcjach (polecenie „otwórz ustawienia Jev”): etykiety dostają identyfikatory, okno przewija się do wybranej */
    const SEC = [['openrouter', /^openrouter/], ['akcent', /^kolor akcentu/], ['tapeta', /^tapeta/], ['interfejs', /^interfejs/], ['glos', /^glos/], ['uzytkownik', /^uzytkownik/], ['hermes', /^hermes/], ['agent', /^agent i proaktywnosc/], ['jev', /^sedzia jev/], ['powiadomienia', /^powiadomienia/], ['skroty', /^skroty klawiszowe/], ['uklady', /^uklady okien/], ['pamiec', /^pamiec/], ['pliki', /^folder roboczy/], ['dane', /^dane/], ['oprogramie', /^o programie/]];
    $$('.label', body).forEach(l => { const hit = SEC.find(([, re]) => re.test(J.norm(l.textContent))); if (hit) l.dataset.sec = hit[0]; });
    /* pasek sekcji + wyszukiwanie pól (docs/spec/10-ustawienia.md §1) */
    { const nav = h('div', { class: 'set-nav' }, '<input class="input" id="setFind" placeholder="Szukaj w ustawieniach…"><div class="set-chips"></div>'); body.prepend(nav);
      const labels = { openrouter: 'Konto AI', akcent: 'Kolor', tapeta: 'Tapeta', interfejs: 'Interfejs', glos: 'Głos', uzytkownik: 'Użytkownik', hermes: 'Hermes', agent: 'Agent', jev: 'Jev', powiadomienia: 'Powiadomienia', skroty: 'Skróty', uklady: 'Układy', pamiec: 'Pamięć', pliki: 'Pliki', dane: 'Dane', oprogramie: 'O programie' };
      const chips = $('.set-chips', nav); Object.entries(labels).forEach(([k, t]) => { const b = h('button', { class: 'chip' }); b.textContent = t; b.onclick = () => ctx.goSection(k); chips.appendChild(b); });
      $('#setFind', nav).oninput = e => { const q = J.norm(e.target.value.trim()); $$('.set-hit', body).forEach(x => x.classList.remove('set-hit')); if (q.length < 2) return; const el = [...$$('.label, .toggle, .row, .card > div', body)].find(x => J.norm(x.textContent).includes(q)); if (el) { el.classList.add('set-hit'); el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); } }; }
    const goSection = sec => { const l = $('[data-sec="' + sec + '"]', body); if (!l) return false; l.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); l.classList.remove('hl'); void l.offsetWidth; l.classList.add('hl'); setTimeout(() => l.classList.remove('hl'), 2200); return true; };
    let secNow = null; ctx.goSection = sec => { const r = goSection(sec); if (r !== false) secNow = sec; return r; };
    ctx.state = () => secNow ? { view: 'section', target: secNow, label: secNow } : null;
    { const va = viewOf(arg), sec = va ? va.target : arg; if (sec) setTimeout(() => ctx.goSection(sec), 80); }
    const sw = $('#sw', body);
    const drawSw = () => { sw.innerHTML = ''; Object.entries(J.THEMES).forEach(([n, [a, b]]) => { const e = h('button', { class: 'swatch' + (s.accent === a ? ' on' : ''), title: n, style: `background:linear-gradient(135deg,${a},${b});color:${a}` }); e.onclick = () => { s.accent = a; s.accent2 = b; J.applyTheme(); J.save(); J.emit('settings'); drawSw(); J.sfx.click(); }; sw.appendChild(e); }); };
    drawSw();
    const wl = $('#wl', body);
    const drawWl = () => { wl.innerHTML = ''; walls.forEach(([k, n, bg]) => { const e = h('button', { class: 'wall' + (s.wall === k ? ' on' : ''), style: `background-image:${bg}` }, n); e.onclick = () => { s.wall = k; J.applyTheme(); J.save(); drawWl(); J.sfx.click(); }; wl.appendChild(e); }); };
    drawWl();
    $$('input[data-k]', body).forEach(i => { i.checked = !!s[i.dataset.k]; i.onchange = () => { s[i.dataset.k] = i.checked; J.save(); J.emit('settings'); J.sfx.click(); }; });
    /* Hermes: preset kosztu i dzienny limit */
    { const hp = $('#hPreset', body), hd = $('#hDaily', body), hu = $('#hDayUsed', body); if (hp) { hp.value = s.hermesPreset || 'balanced'; hp.onchange = () => { s.hermesPreset = hp.value; J.save(); }; hd.value = s.hermesDailyBudget || 0; hd.onchange = () => { s.hermesDailyBudget = J.clamp(+hd.value || 0, 0, 50); J.save(); }; hu.textContent = 'dziś: $' + (J.hermesBudget?.used() || 0).toFixed(4); } }
    /* dziennik zgód */
    { const al = $('#aAllow', body); if (al) { const b = h('button', { class: 'btn sm ghost', style: 'margin-left:6px' }, 'Dziennik zgód'); b.onclick = async () => { const l = (await J.store.get('consent.log', [])).slice(-15).reverse(); J.ask(l.length ? l.map(x => new Date(x.ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + x.label + ' (' + x.source + (x.forced ? ', wymuszona' : '') + ') → ' + ({ yes: 'tak', no: 'nie', always: 'zawsze', timeout: 'brak odpowiedzi' }[x.answer] || x.answer)).join('\n') : 'Dziennik zgód jest pusty.', [{ label: 'OK', value: 'ok', primary: true }], { speak: false, timeout: 120000 }); }; $('#aAllowClr', body)?.after(b); } }
    /* interfejs, głos */
    const us = $('#uiScale', body), usV = $('#usV', body); if (us) { us.value = s.uiScale || 100; usV.textContent = us.value + '%'; us.oninput = () => { usV.textContent = us.value + '%'; }; us.onchange = () => J.uiRun('ui_scale', { percent: +us.value }, { offer: false }); }
    const sm = $('#startMode', body); if (sm) { sm.value = s.startMode || 'work'; sm.onchange = () => { s.startMode = sm.value; J.save(); J.emit('settings'); }; }
    const fsb = $('#filmScen', body), FC = J.workflows?.cinema;
    if (fsb && FC?.scenarios) {
      fsb.innerHTML = FC.scenarios().map(d => '<div class="row" style="font-size:11.5px"><span style="flex:1">' + esc(d.label) + '<small class="dim" style="display:block;font-size:10px">' + esc(FC.describe(d)) + '</small></span><select class="input" data-film="' + esc(d.id) + '" style="width:170px">' + d.modes.map(m => '<option value="' + m + '">' + FC.modeLabels[m] + '</option>').join('') + '</select></div>').join('');
      $$('select[data-film]', body).forEach(sel => { sel.value = FC.rawMode(sel.dataset.film); sel.onchange = () => { FC.setMode(sel.dataset.film, sel.value); J.sfx?.click?.(); }; });
    }
    const fxSel = $('#fxLvl', body), fxNow = () => { const e = $('#fxNow', body); if (e) e.textContent = 'teraz: ' + ({ off: 'bez animacji', tool: 'oszczędne', standard: 'standardowe', cinema: 'kinowe' }[J.fx?.level?.() || s.fxLevel] || '') + (J.fx && J.fx.level() !== (s.fxLevel || 'standard') ? ' (ograniczone: płynność lub „ogranicz ruch” w systemie)' : ''); };
    if (fxSel) { fxSel.value = s.fxLevel || 'standard'; fxSel.onchange = () => J.uiRun('fx_level', { level: fxSel.value }); fxNow(); sub(ctx, 'fx', fxNow); }
    const sv = $('#sVol', body), svV = $('#volV', body); if (sv) { sv.value = s.volume ?? 60; svV.textContent = sv.value + '%'; sv.oninput = () => { svV.textContent = sv.value + '%'; }; sv.onchange = () => { s.volume = +sv.value; J.save(); J.sfx.notify(); }; }
    const sr = $('#spRate', body); if (sr) { sr.value = s.speechRate || 1; sr.onchange = () => { s.speechRate = +sr.value; J.save(); J.voice.speak('Tak brzmi nowe tempo mowy.', { force: true, replace: true }); }; }
    const sl = $('#sttLang', body); if (sl) { sl.value = s.sttLang || 'pl-PL'; sl.onchange = () => { s.sttLang = sl.value; J.save(); }; }
    /* powiadomienia */
    const CH = { task: 'Zadania i przypomnienia', timer: 'Minutnik', market: 'Rynek (alerty kursów)', network: 'Sieć', agent: 'Agent (Jarvis sam z siebie)', files: 'Pliki', hermes: 'Hermes i Jev', routine: 'Rutyny' };
    const drawNt = () => { const box = $('#ntList', body); if (!box) return; box.innerHTML = ''; Object.entries(CH).forEach(([k, t]) => { const c = J.notifChannel(k); const r = h('div', { class: 'row', style: 'font-size:11.5px' }, '<span style="flex:1"></span><label class="mini"><input type="checkbox" data-f="on"> pokazuj</label><label class="mini"><input type="checkbox" data-f="sound"> dźwięk</label><input class="input" type="number" min="0" max="60" data-f="perHour" style="width:58px" title="limit na godzinę">'); r.children[0].textContent = t; $('[data-f=on]', r).checked = c.on; $('[data-f=sound]', r).checked = c.sound; $('[data-f=perHour]', r).value = c.perHour; $$('input', r).forEach(inp => inp.onchange = () => J.uiRun('notif_channel', { kind: k, on: $('[data-f=on]', r).checked, sound: $('[data-f=sound]', r).checked, per_hour: J.clamp(+$('[data-f=perHour]', r).value || 0, 0, 60) }, { offer: false })); box.appendChild(r); }); };
    drawNt();
    /* skróty klawiszowe: kliknij pole i naciśnij kombinację */
    const drawKb = () => { const box = $('#kbList', body); if (!box || !J.KEY_ACTIONS) return; box.innerHTML = ''; Object.entries(J.KEY_ACTIONS).forEach(([id, a]) => { const cur = s.keys?.[id] || a.def; const r = h('div', { class: 'row', style: 'font-size:11.5px' }, '<span style="flex:1"></span><button class="btn sm ghost kb-key"></button><button class="btn sm ghost" title="Domyślny">↺</button>'); r.children[0].textContent = a.label; const kb = r.children[1]; kb.textContent = cur; r.children[2].onclick = () => J.uiRun('keys_set', { action: id, keys: 'reset' }, { offer: false }).then(drawKb);
      kb.onclick = () => { kb.textContent = 'naciśnij…'; kb.classList.add('rec'); const on = e => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { done(); return; } if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return; const combo = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.code === 'Space' ? 'Space' : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join('+'); done(); J.uiRun('keys_set', { action: id, keys: combo }, { offer: false }).then(drawKb); }; const done = () => { removeEventListener('keydown', on, true); kb.classList.remove('rec'); kb.textContent = s.keys?.[id] || a.def; }; addEventListener('keydown', on, true); };
      box.appendChild(r); }); };
    setTimeout(drawKb, 0); $('#kbReset', body).onclick = () => J.uiRun('keys_set', { action: 'all', keys: 'reset' }).then(drawKb);
    /* układy okien */
    const drawLay = () => { const box = $('#layList', body), st = $('#layStart', body); if (!box) return; box.innerHTML = ''; const saved = Object.entries(J.state.layouts || {}); if (!saved.length) box.innerHTML = '<div class="dim" style="font-size:11px">Brak zapisanych układów. Presety: ' + J.layouts.presets().join(', ') + '.</div>';
      saved.forEach(([name, l]) => { const r = h('div', { class: 'row', style: 'font-size:11.5px' }, '<span style="flex:1"><b></b> <small class="dim"></small></span><button class="btn sm ghost">Zastosuj</button><button class="btn sm ghost">Nazwa</button><button class="btn sm ghost danger">×</button>'); $('b', r).textContent = name; $('small', r).textContent = l.apps.map(a => J.APP_NAMES[a.id] || a.id).join(', '); const [ap, rn, rm] = $$('button', r); ap.onclick = () => J.uiRun('wm_arrange', { mode: 'layout', layout: name }); rn.onclick = () => { const n = prompt('Nowa nazwa układu:', name); if (n && n.trim()) J.uiRun('layout_rename', { name, to: n.trim() }).then(drawLay); }; rm.onclick = () => J.uiRun('layout_remove', { name }).then(drawLay); box.appendChild(r); });
      st.innerHTML = ''; [['none', 'bez układu'], ['last', 'okna z poprzedniej sesji'], ...J.layouts.list().map(n => [n, n])].forEach(([v, t]) => { const o = h('option', { value: v }); o.textContent = t; st.appendChild(o); }); st.value = s.layoutStartup || 'none'; st.onchange = () => J.uiRun('layout_startup', { name: st.value }, { offer: false }); };
    drawLay(); $('#laySave', body).onclick = () => { const n = prompt('Nazwa układu:'); if (n && n.trim()) J.uiRun('layout_save', { name: n.trim() }).then(drawLay); };
    sub(ctx, 'settings', () => { drawNt(); });
    /* co jest zapisane */
    const drawSto = async () => { const box = $('#stoList', body); if (!box) return; box.innerHTML = '<div class="dim">Liczę…</div>'; const rows = []; try { rows.push(['localStorage: stan (ustawienia, notatki, zadania, widgety…)', (localStorage.getItem('jarvis-os:v2') || '').length]); } catch (e) { }
      for (const k of ['chat.history', 'chat.items', 'chat.summary', 'memory.facts', 'proc.history', 'jev.log', 'signals.log', 'consent.log', 'widgets.cache']) { try { const v = await J.store.get(k, null); if (v != null) rows.push(['IndexedDB: ' + k, JSON.stringify(v).length]); } catch (e) { } }
      box.innerHTML = ''; rows.forEach(([t, n]) => { const r = h('div', { class: 'row' }, '<span style="flex:1"></span><span class="dim"></span>'); r.children[0].textContent = t; r.children[1].textContent = n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; box.appendChild(r); }); };
    $('#stoRefresh', body).onclick = drawSto; drawSto();
    /* o programie: testy diagnostyczne, samouczek, nakładka, flagi */
    $('#diagRun', body).onclick = async () => { const out = $('#diagOut', body); out.innerHTML = '<div class="dim">Sprawdzam…</div>'; const l = await J.diagnostics(); out.innerHTML = ''; l.forEach(([ok, t, d]) => { const r = h('div', { class: 'row' }, '<span></span><span style="flex:1"></span>'); r.children[0].textContent = ok ? '✓' : '✗'; r.children[0].style.color = ok ? 'var(--ok)' : 'var(--err)'; r.children[1].textContent = t + (d ? ' — ' + d : ''); out.appendChild(r); }); const cp = h('button', { class: 'btn sm ghost' }, 'Kopiuj raport'); cp.onclick = () => navigator.clipboard?.writeText(l.map(([o, t, d]) => (o ? '✓ ' : '✗ ') + t + (d ? ' — ' + d : '')).join('\n')).then(() => J.toast('Skopiowano raport')); out.appendChild(cp); };
    $('#tourRun', body).onclick = () => J.tour?.(true);
    $('#keysShow', body).onclick = () => J.keysHelp?.();
    const dbg = $('#dbgOverlay', body); dbg.checked = !!J.state.ui.debugOverlay; dbg.onchange = () => J.debugOverlay?.(dbg.checked);
    const FLAGS = { w1_windows: 'Okna: uchwyty, przypinanie, menu okna', w2_search: 'Wyszukiwanie wszędzie w palecie', w2_modes: 'Tryby przestrzeni', w2_threads: 'Wątki czatu', w3_notes: 'Notatki: kosz, wersje, tagi', w3_tasks: 'Zadania: powtarzanie, priorytety', w4_widget_spec: 'Widgety z opisu', w4_routines: 'Rutyny', w5_fx: 'Efekty (poziom)' };
    const fl = $('#flagList', body); Object.entries(FLAGS).forEach(([k, t]) => { const r = h('label', { class: 'toggle' }, '<div></div><span class="switch"><input type="checkbox"><i></i></span>'); r.children[0].textContent = t; const c = $('input', r); c.checked = J.flag(k); c.onchange = () => { s.flags = { ...(s.flags || {}), [k]: c.checked }; J.save(); J.emit('settings'); J.toast('Zmiana zadziała w pełni po odświeżeniu strony.'); }; fl.appendChild(r); });
    const vs = $('#vs', body);
    const fillVoices = () => { const v = J.voice.list(); vs.innerHTML = '<option value="">Automatyczny (polski)</option>' + v.map(x => `<option ${x.name === s.voiceName ? 'selected' : ''} value="${esc(x.name)}">${esc(x.name)} · ${esc(x.lang)}</option>`).join(''); };
    fillVoices(); setTimeout(fillVoices, 600);
    vs.onchange = () => { s.voiceName = vs.value; J.save(); const was = s.speech; s.speech = true; J.voice.speak('Tak brzmi mój głos.'); s.speech = was; };
    $('#un', body).value = s.user; $('#city', body).value = s.city;
    $('#un', body).oninput = e => { s.user = e.target.value.toUpperCase() || 'JD'; J.save(); J.emit('settings'); };
    $('#cityGo', body).onclick = async () => { const c = $('#city', body).value.trim(); if (!c) return; try { const g = await J.weather.geocode(c); Object.assign(s, { city: g.city, lat: g.lat, lon: g.lon }); J.save(); J.weather.ts = 0; await J.weather.fetch(); J.toast('Lokalizacja: ' + g.city); } catch (e) { J.toast(e.message); } };
    const hOn = $('#hOn', body), hProv = $('#hProv', body), hUrl = $('#hUrl', body), hModel = $('#hModel', body), hKey = $('#hKey', body), hInfo = $('#hInfo', body), hHelp = $('#hHelp', body);
    const fillH = () => { hOn.checked = !!s.hermesOn; hProv.value = s.hermesProvider; hUrl.value = s.hermesUrl; hModel.value = s.hermesModel; hKey.value = s.hermesKey; };
    const help = () => {
      hInfo.textContent = s.hermesOn ? 'Aktywne: ' + s.hermesModel + ' @ ' + s.hermesUrl + (s.hermesKey ? ' · klucz zapisany' : ' · bez klucza') : 'Wyłączone — działa lokalny silnik poleceń.';
      hHelp.innerHTML = s.hermesProvider === 'desktop'
        ? 'Lekki profil Hermesa <code>jarvis-desktop</code> (bez skilli, terminala i plików) z narzędziami pulpitu przez most MCP. Instalacja: <code>hermes\\install-profile.ps1</code>, potem <code>hermes\\start-desktop-gateway.bat</code>. Wpisz klucz <code>API_SERVER_KEY</code> tego profilu.'
        : s.hermesProvider === 'agent'
        ? `Uruchom Hermes Agent z włączonym serwerem API. W <code>~/.hermes/.env</code>:<br><code>API_SERVER_ENABLED=true</code><br><code>API_SERVER_KEY=twój-klucz</code><br><code>API_SERVER_CORS_ORIGINS=${esc(location.origin)}</code><br>potem <code>hermes gateway</code> i wpisz ten sam klucz powyżej.`
        : s.hermesProvider === 'portal' ? 'Klucz API z <b>portal.nousresearch.com</b>. Modele Hermes: Hermes-4-405B, Hermes-4-70B.'
        : 'Dowolny serwer zgodny z OpenAI z modelem Hermes, np. Ollama: <code>ollama pull hermes3</code>, uruchom z <code>OLLAMA_ORIGINS=' + esc(location.origin) + '</code>.';
    };
    const saveH = () => { s.hermesOn = hOn.checked; s.hermesProvider = hProv.value; s.hermesUrl = hUrl.value.trim(); s.hermesModel = hModel.value.trim() || J.HERMES_PRESETS[s.hermesProvider].model; s.hermesKey = hKey.value.trim(); J.save(); J.emit('settings'); help(); };
    fillH(); help();
    hProv.onchange = () => { const p = J.HERMES_PRESETS[hProv.value]; hUrl.value = p.url; hModel.value = p.model; hKey.value = ''; saveH(); J.brain.reset(); };
    hOn.onchange = hUrl.onchange = hModel.onchange = hKey.onchange = () => { saveH(); J.brain.reset(); };
    $('#hDel', body).onclick = () => { hKey.value = ''; saveH(); };
    $('#hList', body).onclick = async () => { saveH(); hInfo.textContent = 'Pobieram modele…'; try { const l = await J.brain.models(); $('#hModels', body).innerHTML = l.map(m => `<option value="${esc(m)}">`).join(''); hInfo.textContent = 'Dostępne modele: ' + (l.join(', ') || 'brak'); } catch (e) { hInfo.textContent = '✗ ' + e.message; } };
    $('#hTest', body).onclick = async () => { hOn.checked = true; saveH(); hInfo.textContent = 'Łączę z Hermesem…'; try { hInfo.textContent = '✓ ' + await J.brain.test(); J.sfx.notify(); J.log('Hermes połączony', s.hermesModel + ' @ ' + s.hermesUrl); } catch (e) { hInfo.textContent = '✗ ' + e.message; J.sfx.error(); } };
    const bOn = $('#bOn', body), bUrl = $('#bUrl', body), bTok = $('#bTok', body), hMode = $('#hMode', body), bInfo = $('#bInfo', body);
    bOn.checked = !!s.bridgeOn; bUrl.value = s.bridgeUrl || ''; bTok.value = s.bridgeToken || ''; hMode.value = s.hermesMode || 'auto';
    const drawB = () => {
      const b = J.bridge, names = Object.keys(b.hermes || {});
      bInfo.textContent = !s.bridgeOn ? 'Most wyłączony — Hermes dostaje narzędzia w treści zapytania (tryb prompt).'
        : b.status === 'up' ? '✓ Most połączony · ' + b.tools.length + ' narzędzi MCP · ' + (names.length ? 'Hermes używa mostu (profile: ' + names.join(', ') + ')' + (J.brain.mcp ? ' — tryb MCP aktywny dla „' + s.hermesModel + '”' : ' — ale wybrany model „' + s.hermesModel + '” nie korzysta z mostu') : 'Hermes jeszcze się nie zgłosił (uruchom gateway profilu jarvis-desktop)')
        : b.status === 'connecting' ? 'Łączę z mostem…' : '✗ Most niedostępny — uruchom bridge\\start-bridge.bat (połączenie wznawia się samo).';
      const a = b.status === 'up' ? b.agents : null;
      if (a) bInfo.textContent += ' ┃ Agenci Jeva: klucz ' + (a.key ? 'jest' : 'BRAK (integrations\\set-key.ps1)') + ' · przeglądarka ' + (a.web?.up ? 'działa' : 'uruchomi się przy pierwszym użyciu') + ' · komputer ' + (a.computer?.installed ? (a.computer.running ? 'zadanie trwa' : 'gotowy') : 'niezainstalowany (integrations\\setup.ps1)');
    };
    drawB(); sub(ctx, 'bridge', drawB);
    const saveB = () => { s.bridgeOn = bOn.checked; s.bridgeUrl = bUrl.value.trim(); s.bridgeToken = bTok.value.trim(); s.hermesMode = hMode.value; J.save(); J.emit('settings'); drawB(); };
    bOn.onchange = bUrl.onchange = bTok.onchange = hMode.onchange = saveB;
    $('#bConn', body).onclick = () => { saveB(); J.bridge.connect(); J.bridge.refresh(); };
    $('#exp', body).onclick = async () => { const data = await J.backup.export(); const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: 'jarvis-os-kopia-' + J.today() + '.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); J.toast('Kopia zapisana (bez kluczy API)'); };
    $('#imp', body).onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const d = JSON.parse(await f.text()); const pv = J.backup.preview(d); const mode = await J.ask('Plik zawiera: ' + pv.text + '. Co zrobić?', [{ label: 'Scal z moimi danymi', value: 'merge', primary: true }, { label: 'Zastąp wszystko', value: 'replace', danger: true }, { label: 'Anuluj', value: 'no' }], { speak: false }); if (mode !== 'merge' && mode !== 'replace') return; await J.backup.import(d, mode); J.toast('Zaimportowano — przeładowuję…'); setTimeout(() => location.reload(), 900); } catch (err) { J.toast('Nie udało się zaimportować: ' + err.message); } };
    $('#rst', body).onclick = async () => { const v = await J.ask('Co wyczyścić?', [{ label: 'Tylko rozmowy', value: 'chat' }, { label: 'Tylko dziennik Jeva', value: 'jevlog' }, { label: 'Pozycje okien', value: 'windows' }, { label: 'Wszystko', value: 'all', danger: true }, { label: 'Anuluj', value: 'no' }], { speak: false }); if (!v || v === 'no') return; if (v === 'all') { const ok2 = await J.ask('Na pewno usunąć WSZYSTKIE dane Jarvis OS (notatki, zadania, ustawienia, rozmowy)? Tego nie da się cofnąć — zrób wcześniej eksport.', [{ label: 'Usuń wszystko', value: 'yes', danger: true }, { label: 'Anuluj', value: 'no', primary: true }], { speak: false }); if (ok2 === 'yes') J.store.clear().finally(() => J.resetAll()); return; } J.toast(await J.backup.clear(v)); drawSto(); };
    /* agent */
    const aWake = $('#aWake', body); aWake.checked = !!s.wakeWord && J.ear.supported; aWake.disabled = !J.ear.supported; aWake.onchange = () => J.ear.setStandby(aWake.checked);
    sub(ctx, 'settings', () => { aWake.checked = !!J.ear.standby; });
    const aPro = $('#aPro', body); aPro.value = s.proactive || 'quiet'; aPro.onchange = () => { s.proactive = aPro.value; J.save(); J.emit('settings'); J.toast(aPro.value === 'active' ? 'Jarvis będzie sam zaczynał rozmowę przy ważnych sygnałach (max ' + (s.proactiveMax || 4) + '/h)' : 'Sygnały trafią do następnej rozmowy'); };
    const bindT = (id, key, after) => { const el = $('#' + id, body); el.value = s[key] || ''; el.onchange = () => { s[key] = el.value; J.save(); J.emit('settings'); after?.(); }; };
    bindT('aQf', 'quietFrom'); bindT('aQt', 'quietTo'); bindT('aBr', 'briefingTime'); bindT('aSu', 'summaryTime');
    $('#aBrNow', body).onclick = () => J.brain.handle('Rutyna: poranny briefing. Na podstawie kontekstu środowiska (pogoda przez get_weather, zadania na dziś, zaległe, alerty) przygotuj zwięzły briefing dnia w 3–5 zdaniach do odczytania na głos.', { source: 'routine', routine: 'briefing', silentWindow: true });
    $('#aSuNow', body).onclick = () => J.brain.handle('Rutyna: podsumowanie dnia. Sprawdź zadania (tasks_list today) i notatki (notes_list) i podsumuj w 3 zdaniach, co zrobiono, a co przechodzi na jutro.', { source: 'routine', routine: 'summary', silentWindow: true });
    const aFmt = $('#aFmt', body); aFmt.value = s.toolFormat || 'auto'; aFmt.onchange = () => { s.toolFormat = aFmt.value; J.hermes.format = null; J.save(); J.brain.reset(); };
    const drawAllow = () => { const l = J.state.ui.allowAlways || []; $('#aAllow', body).textContent = l.length ? l.map(id => J.registry.get(id)?.label || id).join(', ') : 'brak — ryzykowne narzędzia zawsze pytają'; };
    /* rutyny użytkownika: włącz/wyłącz, uruchom teraz, kroki (kolejność ↑↓), usuń; tworzenie zdaniem */
    const drawRt = () => {
      const box = $('#rtList', body); if (!box) return; box.innerHTML = ''; const l = J.state.routines || [];
      if (!l.length) box.appendChild(h('div', { class: 'dim', style: 'font-size:11px' }, 'Brak własnych rutyn.'));
      l.forEach(r => {
        const trig = !r.trigger || r.trigger.kind === 'manual' ? 'na żądanie' : r.trigger.kind === 'time' ? 'o ' + r.trigger.at + (r.trigger.days?.length ? ' (' + r.trigger.days.join(', ') + ')' : '') : r.trigger.kind === 'phrase' ? '„' + r.trigger.phrase + '”' : r.trigger.event;
        const c = h('div', { class: 'rt-card' }, '<div class="row"><label class="switch"><input type="checkbox"><i></i></label><b></b><small class="dim"></small><span class="sp"></span><button class="btn sm ghost" data-a="run" title="Uruchom teraz">▶</button><button class="btn sm ghost danger" data-a="x" title="Usuń">×</button></div><ol class="rt-steps"></ol>');
        $('b', c).textContent = r.name; $('small', c).textContent = trig + (r.lastRun ? ' · ostatnio ' + new Date(r.lastRun).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (r.history?.[0] && !r.history[0].ok ? ' ⚠' : '') : '');
        $('input', c).checked = r.enabled !== false; $('input', c).onchange = e => { r.enabled = e.target.checked; J.save(); };
        $('[data-a=run]', c).onclick = () => J.uiRun('routine_run', { name: r.id }, { quiet: false });
        $('[data-a=x]', c).onclick = () => J.uiRun('routine_remove', { name: r.id });
        r.steps.forEach((st, i) => { const li = h('li', {}, '<span></span><button class="btn sm ghost" data-a="up" title="Wyżej">↑</button><button class="btn sm ghost" data-a="rm" title="Usuń krok">×</button>'); $('span', li).textContent = st.say ? '„' + st.say + '”' : (J.registry.get(st.command)?.label || st.command) + (Object.keys(st.args || {}).length ? ' (' + Object.values(st.args).filter(v => typeof v !== 'object').join(', ') + ')' : ''); $('[data-a=up]', li).disabled = !i; $('[data-a=up]', li).onclick = () => { [r.steps[i - 1], r.steps[i]] = [r.steps[i], r.steps[i - 1]]; J.save(); drawRt(); }; $('[data-a=rm]', li).disabled = r.steps.length < 2; $('[data-a=rm]', li).onclick = () => { r.steps.splice(i, 1); J.save(); drawRt(); }; $('.rt-steps', c).appendChild(li); });
        box.appendChild(c);
      });
    };
    $('#rtForm', body).onsubmit = async e => { e.preventDefault(); const v = $('#rtNew', body).value.trim(); if (!v) return; const p = J.cmdKit.parseRoutine?.(v.startsWith('zrób') || v.startsWith('zrob') || /^kiedy|^codziennie|^w dni/.test(v) ? v : 'zrób rutynę ' + v); if (!p) return J.toast('Nie rozumiem — napisz np. „zrób rutynę poranek: pogoda, zadania na dziś”'); const r = await J.uiRun('routine_create', p); if (r.ok) { $('#rtNew', body).value = ''; J.toast(r.text); } };
    drawRt(); sub(ctx, 'routines', drawRt);
    drawAllow(); $('#aAllowClr', body).onclick = () => { J.state.ui.allowAlways = []; J.save(); drawAllow(); J.sfx.click(); };
    /* OpenRouter: wspólny klucz */
    const orKey = $('#orKey', body), orBrain = $('#orBrain', body), orJudge = $('#orJudge', body), orInfo = $('#orInfo', body);
    const orFill = () => { orKey.value = s.openrouterKey || ''; orBrain.checked = s.hermesOn && s.hermesProvider === 'openrouter'; orJudge.checked = !!s.jevOn && !!(s.jevKey || s.openrouterKey); };
    const orHelp = () => { orInfo.textContent = !s.openrouterKey ? 'Klucz z openrouter.ai/keys. Jeden klucz uruchamia sędziego Jev i (opcjonalnie) mózg na modelach Hermes 4 w chmurze. Klucz zostaje tylko w tej przeglądarce.' : 'Klucz zapisany · mózg: ' + (orBrain.checked ? 'Hermes 4 przez OpenRouter' : (s.hermesOn ? J.HERMES_PRESETS[s.hermesProvider]?.label || s.hermesProvider : 'lokalny silnik')) + ' · sędzia Jev: ' + (J.judge.enabled() ? 'włączony' : 'wyłączony') + (J.judge.status.state === 'up' ? ' (' + J.judge.status.latency + ' ms)' : ''); };
    const orSave = () => {
      s.openrouterKey = orKey.value.trim();
      if (orBrain.checked) { const p = J.HERMES_PRESETS.openrouter; s.hermesOn = true; s.hermesProvider = 'openrouter'; s.hermesUrl = p.url; if (!/^nousresearch\//.test(s.hermesModel || '')) s.hermesModel = p.model; s.hermesKey = ''; J.hermes.format = null; J.brain.reset(); }
      else if (s.hermesProvider === 'openrouter') { s.hermesProvider = 'agent'; s.hermesUrl = J.HERMES_PRESETS.agent.url; s.hermesModel = J.HERMES_PRESETS.agent.model; }
      s.jevOn = orJudge.checked && !!(s.jevKey || s.openrouterKey);
      J.save(); J.emit('settings'); J.hermesPing(); orHelp(); fillH?.(); help?.(); jvFill?.(); jvHelp?.();
    };
    orFill(); orHelp();
    [orKey, orBrain, orJudge].forEach(el => el.onchange = orSave);
    $('#orEye', body).onclick = () => { orKey.type = orKey.type === 'password' ? 'text' : 'password'; };
    $('#orDel', body).onclick = () => { orKey.value = ''; orBrain.checked = false; orJudge.checked = false; orSave(); };
    $('#orTest', body).onclick = async () => {
      orSave(); if (!s.openrouterKey) { orInfo.textContent = '✗ Wklej klucz.'; return; }
      const out = [];
      if (orJudge.checked) { orInfo.textContent = 'Testuję Jeva…'; try { out.push('Jev: ✓ ' + await J.judge.test()); } catch (e) { out.push('Jev: ✗ ' + e.message); } }
      if (orBrain.checked) { orInfo.textContent = 'Testuję Hermesa 4…'; try { out.push('Hermes: ✓ ' + await J.brain.test()); } catch (e) { out.push('Hermes: ✗ ' + e.message); } }
      if (!out.length) out.push('Zaznacz, do czego użyć klucza (mózg i/lub sędzia).');
      orInfo.textContent = out.join('\n'); J.sfx[out.some(o => /✗/.test(o)) ? 'error' : 'notify']();
    };
    sub(ctx, 'judge', orHelp); sub(ctx, 'hermes', orHelp);
    /* Jev */
    const jvOn = $('#jvOn', body), jvKey = $('#jvKey', body), jvModel = $('#jvModel', body), jvExec = $('#jvExec', body), jvAsk = $('#jvAsk', body), jvInfo = $('#jvInfo', body), jvStats = $('#jvStats', body);
    const jvPrivacy = $('#jvPrivacy', body), jvAuto = $('#jvAuto', body), jvA3 = $('#jvA3', body), jvA2 = $('#jvA2', body), jvBudget = $('#jvBudget', body), jvLite = $('#jvLite', body), jvFast = $('#jvFast', body), jvShadow = $('#jvShadow', body), jvLogText = $('#jvLogText', body);
    const jvFill = () => { jvOn.checked = !!s.jevOn; jvKey.value = s.jevKey || ''; jvModel.value = s.jevModel || J.judge.MODELS[0]; jvExec.value = s.jevExecute ?? .85; jvAsk.value = s.jevAsk ?? .5; jvPrivacy.value = s.jevPrivacy || 'P1'; jvAuto.value = s.jevAutonomy || 'auto'; jvA3.value = s.jevA3 ?? .8; jvA2.value = s.jevA2 ?? .92; jvBudget.value = s.jevBudget ?? 5; jvLite.value = s.hermesModelLite || ''; jvFast.checked = s.jevFast !== false; jvShadow.checked = !!s.jevShadow; jvLogText.checked = !!s.jevLogText; };
    const jvHelp = () => {
      const st = J.judge.status, bg = J.judge.budget, m = { limit: bg.limit(), cost: bg.used() };
      jvInfo.textContent = !s.jevKey ? 'Podaj klucz OpenRouter (openrouter.ai/keys) — model typesafe/jev-1.13. Bez klucza decyzje podejmuje rejestr i Hermes.' : (s.jevOn ? 'Aktywny' : 'Wyłączony') + (s.jevShadow ? ' (tryb cienia)' : '') + ' · wywołania: ' + (J.state.stats.jevCalls || 0) + ' · koszt łącznie: $' + (J.state.stats.jevCost || 0).toFixed(5) + (m.limit ? ' · ten miesiąc: $' + (+m.cost || 0).toFixed(4) + ' z $' + m.limit : '') + (st.state === 'up' ? ' · ostatnio ' + st.latency + ' ms' : st.state === 'down' ? ' · błąd: ' + st.lastError : '');
      const x = J.judge.log.stats(), ad = J.policy.adaptInfo();
      jvStats.textContent = x.decisions ? 'Ostatnie 30 dni: ' + x.decisions + ' decyzji · sam wykonał ' + x.executed + ' · pytał ' + (x.askedYes + x.askedNo) + ' (tak ' + x.askedYes + ') · cofnięte ' + x.undone + ' · szybka ścieżka ' + x.fast + ' · do Hermesa ' + x.hermes + ' · średnio ' + x.avgMs + ' ms · odrzucone ' + Math.round(x.rejectRate * 100) + '%' + (ad.length ? '\nPodniesione progi: ' + ad.map(a => a.id + ' +' + a.bump).join(', ') : '') : 'Dziennik decyzji jest pusty — statystyki pojawią się po pierwszych poleceniach.';
    };
    const jvSave = () => {
      s.jevOn = jvOn.checked; s.jevKey = jvKey.value.trim(); s.jevModel = jvModel.value; s.jevExecute = J.clamp(+jvExec.value || .85, .5, 1); s.jevAsk = J.clamp(+jvAsk.value || .5, .1, s.jevExecute);
      s.jevPrivacy = jvPrivacy.value; s.jevAutonomy = jvAuto.value; s.jevA3 = J.clamp(+jvA3.value || .8, .5, 1); s.jevA2 = J.clamp(+jvA2.value || .92, .5, 1); s.jevBudget = J.clamp(+jvBudget.value || 0, 0, 100);
      s.hermesModelLite = jvLite.value.trim(); s.jevFast = jvFast.checked; s.jevShadow = jvShadow.checked; s.jevLogText = jvLogText.checked; J.save(); J.emit('settings'); jvHelp();
    };
    jvFill(); jvHelp();
    [jvOn, jvKey, jvModel, jvExec, jvAsk, jvPrivacy, jvAuto, jvA3, jvA2, jvBudget, jvLite, jvFast, jvShadow, jvLogText].forEach(el => el.onchange = jvSave);
    $('#jvTest', body).onclick = async () => { jvSave(); jvInfo.textContent = 'Łączę z OpenRouter…'; try { jvInfo.textContent = '✓ ' + await J.judge.test(); jvOn.checked = true; jvSave(); J.sfx.notify(); } catch (e) { jvInfo.textContent = '✗ ' + e.message; J.sfx.error(); } };
    $('#jvExport', body).onclick = () => { const a = h('a', { href: URL.createObjectURL(new Blob([J.judge.log.export()], { type: 'application/json' })), download: 'jev-dziennik-' + J.today() + '.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#jvResetAdapt', body).onclick = () => { J.policy.resetAdapt(); jvHelp(); J.toast('Progi Jeva wróciły do ustawień.'); };
    $('#jvClearLog', body).onclick = () => { J.judge.log.clear(); jvHelp(); };
    sub(ctx, 'judge', jvHelp);
    /* pamięć */
    const drawMem = async () => { const l = await J.memory.all(); const box = $('#memList', body); box.innerHTML = l.length ? '' : '<div class="dim" style="font-size:11px">Brak zapamiętanych faktów.</div>'; l.slice().reverse().forEach(f => { const r = h('div', { class: 'row', style: 'font-size:11.5px' }, '<span style="flex:1" title="Kliknij, aby poprawić"></span><span class="dim" style="font-size:9.5px"></span><button class="btn sm ghost" title="Popraw">✎</button><button class="btn sm ghost danger" title="Zapomnij">×</button>'); r.children[0].textContent = f.fact; r.children[1].textContent = f.scope;
      const edit = () => { const inp = h('input', { class: 'input', maxlength: '300', 'aria-label': 'Popraw fakt' }); inp.value = f.fact; r.children[0].replaceWith(inp); inp.focus(); inp.select(); let done = false; const save = async () => { if (done) return; done = true; const v = inp.value.trim(); if (v && v !== f.fact) await J.uiRun('memory_edit', { fact: f.id, text: v }); drawMem(); }; inp.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { done = true; drawMem(); } }; inp.onblur = save; };
      r.children[0].ondblclick = edit; r.children[2].onclick = edit; r.children[3].onclick = async () => { await J.uiRun('memory_forget', { fact: f.id }); drawMem(); }; box.appendChild(r); }); };
    drawMem(); sub(ctx, 'memory', drawMem);
    /* pliki */
    const fsInfo = async () => { const el = $('#fsInfo', body); if (!J.files.supported) { el.textContent = 'Dostęp do folderów wymaga Chrome lub Edge.'; return; } const hnd = J.files.handle || await J.files.load(); el.textContent = hnd ? 'Folder: ' + hnd.name : 'Nie wybrano folderu.'; };
    fsInfo(); $('#fsPick', body).onclick = async () => { try { await J.files.pick(); J.toast('Folder roboczy: ' + J.files.handle.name); fsInfo(); } catch (e) { if (e.name !== 'AbortError') J.toast(e.message); } };
    $('#fsPerm', body).onclick = async () => { try { await J.files.ensure(true); J.toast('Dostęp do folderu odświeżony'); } catch (e) { J.toast(e.message); } };
    sub(ctx, 'files', fsInfo);
  }
};

})();
