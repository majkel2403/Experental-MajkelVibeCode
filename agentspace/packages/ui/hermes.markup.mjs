// The Hermes "command deck" as one template (Design Component markup: {{holes}}, sc-if, sc-for). The web app
// (web/dc-lite.js) and the canvas boards (artifact/build-app.mjs) render exactly this with hermes.logic.js and
// hermes.css. Layers: the scene (canvas, full screen) -> vignette -> the interface grid (command bar, crew rail,
// free middle cell, drawer, dock) -> overlays (new order, report).
const I = (d, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  reactor: '<svg class="hx-reactor" viewBox="0 0 32 32" aria-hidden="true"><circle class="r a" cx="16" cy="16" r="14"/><circle class="r b" cx="16" cy="16" r="10"/><circle class="r c" cx="16" cy="16" r="6.5"/><circle class="d" cx="16" cy="16" r="2.6"/></svg>',
  mark: '<svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="#F2C14E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="5"/><path d="M11 15C8 14.5 5.5 12.8 3.5 9.5"/><path d="M11 18C8.5 18.2 6 17.5 4 15.5"/><path d="M21 15C24 14.5 26.5 12.8 28.5 9.5"/><path d="M21 18C23.5 18.2 26 17.5 28 15.5"/><path d="M16 21v7"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>',
  go: '<svg viewBox="0 0 24 24" width="18" height="18" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  restart: I('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>', 18),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  upload: I('<path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 15v4h14v-4"/>'),
  report: I('<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/><path d="M10 12h5M10 15.5h5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  follow: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', 18),
  fit: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 18),
  panel: I('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M14 5v14"/>'),
};

const tabs = `
      <div class="hx-dh" role="tablist" aria-label="Panel">
        <sc-for list="{{tabs}}" as="tb" hint-placeholder-count="5"><button type="button" role="tab" class="hx-tab" aria-selected="{{tb.on}}" aria-label="{{tb.name}}" title="{{tb.name}}" onClick="{{tb.pick}}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M{{tb.d}}"/></svg><span class="lbl">{{tb.name}}</span><span class="ct">{{tb.count}}</span></button></sc-for>
        <button type="button" class="hx-btn hx-auto" aria-pressed="{{auto}}" onClick="{{toggleAuto}}" title="Panel sam pokazuje to, co dzieje się teraz">Auto</button>
      </div>`;

const panes = `
      <sc-if value="{{paneCode}}" hint-placeholder-val="{{ true }}">
        <section class="hx-pane" aria-label="Kod i terminal">
          <div class="hx-ph"><span class="d">◆</span>Kod i terminal<span class="m">{{codeMeta}}</span></div>
          <div class="hx-pb">
            <sc-if value="{{hasCode}}" hint-placeholder-val="{{ true }}">
              <div class="hx-win" style="flex:1 1 55%">
                <div class="hx-win-h"><b class="hx-ellip">{{code.file}}</b><span class="hx-badge" style="--c:{{code.badgeColor}}">{{code.badge}}</span><span class="m">{{code.who}} · {{code.diff}}</span></div>
                <div class="hx-code hx-scroll" style="flex:1;min-height:0"><sc-for list="{{code.lines}}" as="ln" hint-placeholder-count="5"><div class="hx-ln" data-kind="{{ln.kind}}"><span class="no">{{ln.n}}</span><span class="sg">{{ln.sign}}</span><span><sc-for list="{{ln.tokens}}" as="tk" hint-placeholder-count="3"><span style="color:{{tk.c}}">{{tk.s}}</span></sc-for><sc-if value="{{ln.caret}}" hint-placeholder-val="{{ false }}"><span class="hx-caret"></span></sc-if></span></div></sc-for></div>
              </div>
            </sc-if>
            <sc-if value="{{hasTerm}}" hint-placeholder-val="{{ true }}">
              <div class="hx-win" style="flex:1 1 45%">
                <div class="hx-win-h"><b>terminal</b><span class="hx-badge" style="--c:{{term.stateColor}}">{{term.state}}</span><span class="m">{{term.who}}</span></div>
                <div class="hx-term hx-scroll" style="flex:1;min-height:0"><div class="cmd">{{term.command}}<sc-if value="{{term.typing}}" hint-placeholder-val="{{ false }}"><span class="hx-caret"></span></sc-if></div><sc-for list="{{term.lines}}" as="tl" hint-placeholder-count="3"><div class="{{tl.cls}}">{{tl.s}}</div></sc-for></div>
              </div>
            </sc-if>
            <sc-if value="{{noCode}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Tu pojawi się kod pisany przez agentów i polecenia, które uruchamiają.</div></sc-if>
          </div>
        </section>
      </sc-if>
      <sc-if value="{{paneTalk}}" hint-placeholder-val="{{ false }}">
        <section class="hx-pane" aria-label="Rozmowy">
          <div class="hx-ph"><span class="d">◆</span>Rozmowy<span class="m">{{talkMeta}}</span></div>
          <div class="hx-scroll" style="flex:1;min-height:0">
            <ol><sc-for list="{{talk}}" as="m" hint-placeholder-count="4"><li class="hx-row" data-fresh="{{m.fresh}}" style="--c:{{m.color}}"><span class="hx-k"><span>{{m.time}}</span><span class="who">{{m.from}}</span><span>→</span><span class="who">{{m.to}}</span><span class="r">{{m.tone}}</span></span>{{m.text}}</li></sc-for></ol>
            <sc-if value="{{noTalk}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Agenci jeszcze ze sobą nie rozmawiali.</div></sc-if>
          </div>
        </section>
      </sc-if>
      <sc-if value="{{paneFiles}}" hint-placeholder-val="{{ false }}">
        <section class="hx-pane" aria-label="Pliki">
          <div class="hx-ph"><span class="d">◆</span>Pliki<span class="m">{{filesMeta}}</span></div>
          <div class="hx-scroll" style="flex:1;min-height:0">
            <ol><sc-for list="{{files}}" as="f" hint-placeholder-count="4"><li><button type="button" class="hx-row" data-fresh="{{f.fresh}}" style="--c:{{f.color}}" onClick="{{f.pick}}" onMouseEnter="{{f.enter}}" onMouseLeave="{{f.leave}}"><span class="hx-k"><span class="who hx-ellip">{{f.name}}</span><span style="color:var(--ok)">{{f.diff}}</span><span class="r">{{f.kind}}</span></span><span class="hx-path hx-ellip">{{f.dir}} · {{f.who}} · {{f.time}}</span></button></li></sc-for></ol>
            <sc-if value="{{noFiles}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Żaden plik nie został jeszcze utworzony ani zmieniony.</div></sc-if>
          </div>
        </section>
      </sc-if>
      <sc-if value="{{paneLog}}" hint-placeholder-val="{{ false }}">
        <section class="hx-pane" aria-label="Dziennik">
          <div class="hx-ph"><span class="d">◆</span>Dziennik<span class="m">{{logMeta}}</span></div>
          <div class="hx-scroll" style="flex:1;min-height:0">
            <ol><sc-for list="{{log}}" as="l" hint-placeholder-count="6"><li class="hx-row" data-fresh="{{l.fresh}}" style="--c:{{l.color}}"><span class="hx-k"><span>{{l.time}}</span><span>{{l.type}}</span><span class="hx-ellip">{{l.who}}</span></span>{{l.text}}</li></sc-for></ol>
            <sc-if value="{{logEmpty}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Przebieg jeszcze się nie zaczął.</div></sc-if>
          </div>
        </section>
      </sc-if>
      <sc-if value="{{paneIns}}" hint-placeholder-val="{{ false }}">
        <section class="hx-pane" aria-label="Inspektor" aria-live="polite">
          <div class="hx-ph"><span class="d">◆</span>Inspektor<span class="m">{{ins.kind}}</span><button type="button" class="hx-btn hx-ghost hx-ico" style="min-height:28px;width:28px;min-width:28px" onClick="{{closeSel}}" aria-label="Zamknij inspektor">${ICON.close}</button></div>
          <div class="hx-pb hx-scroll">
            <sc-if value="{{hasSel}}" hint-placeholder-val="{{ true }}">
              <div class="hx-st">{{ins.status}}</div>
              <h3 class="hx-h3">{{ins.label}}</h3>
              <sc-if value="{{ins.hasSub}}" hint-placeholder-val="{{ true }}"><p class="hx-path" style="word-break:break-all">{{ins.sub}}</p></sc-if>
              <dl class="hx-dl"><sc-for list="{{ins.stats}}" as="st" hint-placeholder-count="3"><dt>{{st.k}}</dt><dd>{{st.v}}</dd></sc-for></dl>
              <span class="hx-cap">Co robił · ostatnie zdarzenia</span>
              <sc-for list="{{ins.events}}" as="e" hint-placeholder-count="3"><div class="hx-ev" style="--c:{{e.color}}"><span class="k">{{e.time}} · {{e.type}}</span><br>{{e.text}}</div></sc-for>
            </sc-if>
            <sc-if value="{{noSel}}" hint-placeholder-val="{{ false }}"><div class="hx-empty" style="padding:0">Kliknij plik albo agenta na scenie, aby zobaczyć, co robił.</div></sc-if>
          </div>
        </section>
      </sc-if>`;

const intro = `
  <sc-if value="{{introOpen}}" hint-placeholder-val="{{ false }}">
    <div class="hx-over">
      <section class="hx-card hx-glass" role="dialog" aria-label="Nowe zlecenie">
        <sc-if value="{{introClosable}}" hint-placeholder-val="{{ false }}"><button type="button" class="hx-btn hx-ghost hx-ico hx-x" onClick="{{closeIntro}}" aria-label="Zamknij">${ICON.close}</button></sc-if>
        <span class="hx-eyebrow">Hermes · Centrum dowodzenia</span>
        <h2>Co ma zrobić <em>Hermes</em>?</h2>
        <label for="hx-task" class="hx-cap">Zlecenie</label>
        <textarea id="hx-task" class="hx-task" rows="3" value="{{taskText}}" onChange="{{onTask}}" placeholder="Opisz zadanie własnymi słowami…"></textarea>
        <div class="hx-launch"><button type="button" class="hx-btn hx-pri" onClick="{{launch}}">${ICON.go}Uruchom Hermesa</button><span class="hx-note">{{matchNote}}</span></div>
        <span class="hx-cap">Zapisane przebiegi</span>
        <div class="hx-runs"><sc-for list="{{runs}}" as="r" hint-placeholder-count="4"><button type="button" class="hx-run" aria-pressed="{{r.active}}" onClick="{{r.pick}}"><b>{{r.name}}</b><small>{{r.meta}}</small></button></sc-for></div>
        <label class="hx-btn hx-file" style="align-self:flex-start">${ICON.upload}Wczytaj własny log<input type="file" accept=".jsonl,.json,.ndjson,.txt" onChange="{{onFile}}" aria-label="Wczytaj log zdarzeń w formacie JSONL"></label>
      </section>
    </div>
  </sc-if>`;

const dossier = `
  <sc-if value="{{reportOpen}}" hint-placeholder-val="{{ false }}">
    <div class="hx-over">
      <section class="hx-card hx-glass" role="dialog" aria-label="Raport z przebiegu" style="width:min(820px,100%)">
        <button type="button" class="hx-btn hx-ghost hx-ico hx-x" onClick="{{closeReport}}" aria-label="Zamknij raport">${ICON.close}</button>
        <span class="hx-eyebrow" style="color:{{report.statusColor}}">◆ {{report.status}} · {{report.run}}</span>
        <h2>{{report.title}}</h2>
        <p style="color:var(--mut);font-size:15px">{{report.summary}}</p>
        <ul class="hx-rk"><sc-for list="{{report.kpis}}" as="k" hint-placeholder-count="4"><li><span class="hx-cap">{{k.label}}</span><b>{{k.value}}</b></li></sc-for></ul>
        <sc-if value="{{report.hasDoc}}" hint-placeholder-val="{{ false }}"><div><span class="hx-cap">{{report.docPath}}</span><div class="hx-doc" style="margin-top:6px"><pre>{{report.doc}}</pre></div></div></sc-if>
        <div><span class="hx-cap">Wyniki zespołu</span><sc-for list="{{report.results}}" as="rr" hint-placeholder-count="3"><div class="hx-ev"><b>{{rr.who}}</b><span style="color:var(--mut);margin-left:6px">— {{rr.text}}</span></div></sc-for></div>
        <div class="hx-launch"><button type="button" class="hx-btn hx-pri" onClick="{{replay}}">${ICON.restart}Odtwórz jeszcze raz</button><button type="button" class="hx-btn" onClick="{{newOrder}}">${ICON.plus}Nowe zlecenie</button></div>
      </section>
    </div>
  </sc-if>`;


const boot = `
  <sc-if value="{{bootOpen}}" hint-placeholder-val="{{ false }}">
    <div class="hx-boot">
      <div class="bgrid"></div>
      <button type="button" class="hx-skipbtn" onClick="{{skipBoot}}" aria-label="Pomiń animację startową"></button>
      <div class="inner">
        <div class="reactor"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="r r0" cx="110" cy="110" r="104"/><circle class="r r1" cx="110" cy="110" r="92"/><circle class="r r2" cx="110" cy="110" r="72"/><circle class="r r3" cx="110" cy="110" r="52"/><circle class="dot" cx="110" cy="110" r="16"/></svg></div>
        <h2><span style="animation-delay:.5s">H</span><span style="animation-delay:.6s">E</span><span style="animation-delay:.7s">R</span><span style="animation-delay:.8s">M</span><span style="animation-delay:.9s">E</span><span style="animation-delay:1s">S</span></h2>
        <div class="sub">Centrum dowodzenia zespołu agentów</div>
        <div class="log"><sc-for list="{{bootLog}}" as="bl" hint-placeholder-count="4"><div style="--d:{{bl.d}}">{{bl.text}} <b>{{bl.ok}}</b></div></sc-for></div>
        <div class="bar"><i></i></div>
        <div class="skip">kliknij, aby pominąć</div>
      </div>
    </div>
  </sc-if>`;

// rootStyle: the board gives the root its height; the web app lets it fill the page
export function markup(rootStyle = '') {
  return `
<div class="hx" id="hx-root" data-bp="{{bp}}" data-sheet="{{sheet}}" style="${rootStyle}">
  <div class="hx-stage">
    <canvas id="hx-gl" class="hx-cv" aria-hidden="true"></canvas>
    <canvas id="hx-ov" class="hx-cv hx-ov" role="img" aria-label="{{sceneAria}}"></canvas>
  </div>
  <div class="hx-vig"></div>
  <div class="hx-fx" aria-hidden="true"><div class="glow"></div><div class="grid"></div><div class="noise"></div><div class="scan"></div></div>
  <div class="hx-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

  <div class="hx-ui">
    <header class="hx-top hx-glass">
      <div class="hx-brand">
        <span class="hx-mark">${ICON.reactor}</span>
        <div style="min-width:0"><h1>HERMES <span class="sl">//</span> <span class="long">CENTRUM DOWODZENIA</span></h1><div class="hx-run-t hx-ellip">{{runLine}}</div></div>
      </div>
      <ol class="hx-steps" aria-label="Fazy przebiegu"><sc-for list="{{phases}}" as="ph" hint-placeholder-count="5"><li class="hx-step" data-state="{{ph.state}}" style="--fill:{{ph.fill}}%" title="{{ph.title}}"><span class="n">{{ph.num}}</span><span class="t hx-ellip">{{ph.name}}</span></li></sc-for></ol>
      <span class="hx-pill" data-live="{{isLive}}" style="--c:{{statusColor}}"><i></i>{{statusText}}</span>
      <div class="hx-clock">{{clockNow}}<small>/ {{clockDur}}</small></div>
      <div class="hx-actions">
        <button type="button" class="hx-btn hx-pri" onClick="{{newOrder}}" aria-label="Nowe zlecenie">${ICON.plus}<span class="lbl">Nowe zlecenie</span></button>
        <button type="button" class="hx-btn" data-on="{{reportReady}}" onClick="{{openReport}}" aria-label="Raport" disabled="{{reportPending}}">${ICON.report}<span class="lbl">Raport</span></button>
      </div>
    </header>

    <aside class="hx-rail hx-glass" aria-label="Zespół">
      <div class="hx-rail-b hx-scroll">
        <sc-if value="{{hasBrief}}" hint-placeholder-val="{{ true }}"><div class="hx-brief"><span class="hx-cap">Zlecenie · {{briefBy}}</span><p>{{briefText}}</p></div></sc-if>
        <span class="hx-cap">Zespół · {{teamMeta}}</span>
        <ul class="hx-agents">
          <sc-for list="{{team}}" as="a" hint-placeholder-count="3">
            <li><button type="button" class="hx-agent" data-hl="{{a.hl}}" data-fresh="{{a.fresh}}" style="{{a.style}}" title="{{a.name}}" onClick="{{a.pick}}" onMouseEnter="{{a.enter}}" onMouseLeave="{{a.leave}}"><span class="hx-orb" data-work="{{a.working}}" data-state="{{a.state}}"></span><span class="tx"><span class="nm"><b>{{a.name}}</b><sc-if value="{{a.fresh}}" hint-placeholder-val="{{ false }}"><span class="hx-new">NOWY</span></sc-if></span><span class="rl hx-ellip">{{a.role}}</span><span class="do hx-ellip">{{a.doing}}</span></span><span class="st">{{a.status}}</span></button></li>
          </sc-for>
        </ul>
        <sc-if value="{{hasPlan}}" hint-placeholder-val="{{ true }}">
          <span class="hx-cap">Plan · {{planMeta}}</span>
          <ol class="hx-plan"><sc-for list="{{plan}}" as="p" hint-placeholder-count="4"><li data-state="{{p.state}}"><span class="mk">{{p.mark}}</span><span>{{p.text}}</span></li></sc-for></ol>
        </sc-if>
      </div>
    </aside>

    <div class="hx-free" id="hx-free">
      <div class="hx-legend"><sc-for list="{{chips}}" as="c" hint-placeholder-count="4"><span class="hx-chip" style="--c:{{c.colour}}"><i></i><span>{{c.text}}</span><b>{{c.n}}</b></span></sc-for></div>
      <div class="hx-cam hx-glass" role="group" aria-label="Kamera">
        <button type="button" class="hx-btn" aria-pressed="{{follow}}" onClick="{{toggleFollow}}" title="Kamera podąża za pracą agentów">${ICON.follow}<span class="lbl">Śledź pracę</span></button>
        <button type="button" class="hx-btn hx-ico zoom" onClick="{{zoomOut}}" aria-label="Oddal">−</button>
        <button type="button" class="hx-btn hx-ico zoom" onClick="{{zoomIn}}" aria-label="Przybliż">+</button>
        <button type="button" class="hx-btn hx-ico" onClick="{{resetCam}}" aria-label="Dopasuj widok">${ICON.fit}</button>
      </div>
    </div>

    <aside class="hx-drawer hx-glass" aria-label="Panel roboczy">
${tabs}
${panes}
    </aside>

    <footer class="hx-dock hx-glass">
      <div class="hx-nar" data-fresh="{{nar.fresh}}" style="--c:{{nar.colour}}" aria-live="off">
        <span class="hx-orb" data-work="{{nar.working}}"></span>
        <div class="line"><span class="who">{{nar.who}}</span><span class="vb hx-ellip">{{nar.verb}}</span><span class="ob">{{nar.obj}}</span><span class="ex hx-ellip">{{nar.extra}}</span></div>
        <sc-if value="{{reportReady}}" hint-placeholder-val="{{ false }}"><button type="button" class="hx-btn hx-pri more" onClick="{{openReport}}">${ICON.report}Raport gotowy</button></sc-if>
        <button type="button" class="hx-btn hx-ico hx-sheetbar more" data-on="{{sheet}}" onClick="{{toggleSheet}}" aria-label="Panel roboczy">${ICON.panel}</button>
      </div>
      <div class="hx-deck">
        <div class="hx-tp">
          <button type="button" class="hx-btn hx-pri hx-ico" onClick="{{togglePlay}}" aria-label="{{playAria}}"><sc-if value="{{isPlaying}}" hint-placeholder-val="{{ false }}">${ICON.pause}</sc-if><sc-if value="{{notPlaying}}" hint-placeholder-val="{{ true }}">${ICON.play}</sc-if></button>
          <button type="button" class="hx-btn hx-ico" onClick="{{restart}}" aria-label="Od początku">${ICON.restart}</button>
          <div class="hx-seg" role="group" aria-label="Prędkość odtwarzania"><sc-for list="{{speeds}}" as="sp" hint-placeholder-count="4"><button type="button" class="hx-btn" aria-pressed="{{sp.active}}" onClick="{{sp.pick}}">{{sp.label}}</button></sc-for></div>
        </div>
        <div class="hx-lanes" style="height:{{lanesH}}px">
          <div class="names"><sc-for list="{{laneNames}}" as="ln" hint-placeholder-count="3"><span style="--c:{{ln.colour}}"><i></i>{{ln.name}}</span></sc-for></div>
          <canvas id="hx-lanes" aria-hidden="true"></canvas>
          <div class="hx-played" style="width:calc((100% - 96px) * {{pct}} / 100)"></div>
          <div class="hx-head" style="left:calc(96px + (100% - 96px) * {{pct}} / 100)"></div>
          <input type="range" class="hx-range" min="0" max="1000" step="1" value="{{scrub}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{clockNow}}">
        </div>
      </div>
    </footer>
  </div>
${intro}${dossier}${boot}
</div>`;
}
