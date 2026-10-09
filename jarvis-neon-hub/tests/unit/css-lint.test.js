/* Lint „zakazanych animacji” CSS (plan neonowy §4.1) jako ZAPADKA: porównanie naruszeń w css/*.css z allow-listą
   tests/fixtures/css-anim-allowlist.json. Pada, gdy pojawi się nowe naruszenie ALBO gdy wpis z listy już nim nie jest
   (wymusza kurczenie listy w miarę poprawek z Fazy 1). Parser: tools/css-lint.js. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { lint, lintRepo, transitionProps, stripComments } = require('../../tools/css-lint.js');
const ROOT = path.join(__dirname, '..', '..');
const key = v => [v.file, v.kind, v.where, v.prop].join(' | ');
const has = (res, kind, where, prop) => res.some(v => v.kind === kind && v.where === where && v.prop === prop);

/* ---------- parser ---------- */
test('lint: keyframes animujące box-shadow/filter/top/background-position/width są wykrywane, transform i opacity nie', () => {
  const r = lint('@keyframes a{from{top:0}to{top:100%}} @keyframes b{50%{box-shadow:0 0 9px red}} @keyframes c{to{filter:blur(4px);opacity:0}} @keyframes d{to{background-position:44px 44px}} @keyframes e{from{width:0}} @keyframes ok{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}');
  assert.deepEqual(r.map(v => v.where + ':' + v.prop), ['a:top', 'b:box-shadow', 'c:filter', 'd:background-position', 'e:width']);
  assert.ok(r.every(v => v.kind === 'keyframes' && v.count === 1), 'jedna pozycja na (nazwa, właściwość), nie na klatkę');
});
test('lint: skrót transition bez nazwy właściwości = all; jawne właściwości kompozytora są czyste', () => {
  const r = lint('.a{transition:.2s}.b{transition:.3s cubic-bezier(.2,.9,.3,1.1)}.c{transition:all .2s}.d{transition:opacity .2s,transform .3s ease-out}.e{transition:none}.f{transition:color .2s,background .2s!important}.g{transition:opacity .3s,transform .34s cubic-bezier(.2,.9,.3,1.1),visibility 0s .34s}');
  assert.deepEqual(r.map(v => v.where + ':' + v.prop), ['.a:all', '.b:all', '.c:all']);
});
test('lint: lista właściwości w transition i transition-property, także z box-shadow/filter/width/left', () => {
  const r = lint('.a{transition:opacity .2s,width .3s}.b{transition-property:left,top}.c{transition-property:opacity,transform}.d{transition:filter 1s,transform .6s}.e{transition:margin-left .2s}.f{transition-property:none}');
  assert.deepEqual(r.map(v => v.where + ':' + v.prop).sort(), ['.a:width', '.b:left', '.b:top', '.d:filter', '.e:margin-left'].sort());
});
test('lint: komentarze, @media i ciągi znaków nie wprowadzają błędów', () => {
  const css = '/* .x{transition:.2s} @keyframes z{to{top:0}} */ .a{content:"/* nie komentarz */ {transition:.5s}";transition:opacity .2s}\n@media (max-width:640px){.m{transition:.3s}.n{transition:transform .2s}}\n@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}\n@supports (backdrop-filter:blur(1px)){.s{transition:box-shadow .2s}}';
  const r = lint(css);
  assert.deepEqual(r.map(v => v.where + ':' + v.prop), ['@media (max-width:640px) .m:all', '@supports (backdrop-filter:blur(1px)) .s:box-shadow']);
  assert.equal(stripComments('a/* b */c'), 'a c');
  assert.equal(stripComments('x{content:"/* a */"}'), 'x{content:"/* a */"}');
});
test('lint: url(data:…;…) z średnikiem i nawiasami nie rozbija deklaracji; ostatnia deklaracja bez średnika jest czytana', () => {
  const r = lint('.a{background:url(data:image/svg+xml;utf8,<svg xmlns=\'x\'><path d=\'M0 0\'/></svg>) center/cover;transition:.2s}.b{color:red;transition:width .2s}');
  assert.deepEqual(r.map(v => v.where + ':' + v.prop), ['.a:all', '.b:width']);
});
test('lint: @property jest zakazane, a wiele wystąpień tego samego naruszenia zlicza się w count', () => {
  const r = lint('@property --ang{syntax:"<angle>";inherits:false;initial-value:0deg}.a{transition:.2s}.a{transition:.4s}');
  assert.ok(has(r, 'property', '--ang', '@property'));
  assert.equal(r.find(v => v.where === '.a').count, 2);
});
test('transitionProps: elementy listy rozdzielane tylko na poziomie 0 (przecinki w cubic-bezier nie dzielą)', () => {
  assert.deepEqual(transitionProps('transform .3s cubic-bezier(.2,.9,.3,1.1),opacity .3s'), ['transform', 'opacity']);
  assert.deepEqual(transitionProps('.4s cubic-bezier(.2,.9,.3,1.15)'), ['all']);
  assert.deepEqual(transitionProps('none'), []);
});

/* ---------- zapadka na prawdziwym CSS ---------- */
test('lint CSS: naruszenia = dokładnie allow-lista (nowe naruszenie ALBO wpis już nie będący naruszeniem pada)', () => {
  const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'css-anim-allowlist.json'), 'utf8')).entries;
  const bad = allow.filter(e => !e.reason || String(e.reason).trim().length < 12 || !e.file || !e.kind || !e.where || !e.prop || !(e.count >= 1));
  assert.deepEqual(bad.map(key), [], 'każdy wpis allow-listy wymaga pól file/kind/where/prop/count oraz uzasadnienia (reason)');
  const keys = allow.map(key); assert.equal(new Set(keys).size, keys.length, 'duplikaty w allow-liście');
  const now = new Map(lintRepo(ROOT).map(v => [key(v), v])), was = new Map(allow.map(e => [key(e), e]));
  const added = [], stale = [], more = [];
  for (const [k, v] of now) { const e = was.get(k); if (!e) added.push(`${k}  ×${v.count}`); else if (v.count > e.count) more.push(`${k}  jest ×${v.count}, na liście ×${e.count}`); }
  for (const [k, e] of was) { const v = now.get(k); if (!v) stale.push(k); else if (v.count < e.count) stale.push(`${k}  jest ×${v.count}, na liście ×${e.count} — zmniejsz count`); }
  assert.deepEqual(added, [], 'NOWE naruszenia zasad animacji (animuj tylko transform/opacity; jawna lista właściwości w transition). Jeśli to świadomy wyjątek, dopisz go do tests/fixtures/css-anim-allowlist.json z uzasadnieniem:\n  ' + added.join('\n  '));
  assert.deepEqual(more, [], 'Przybyło wystąpień znanego naruszenia:\n  ' + more.join('\n  '));
  assert.deepEqual(stale, [], 'Te wpisy allow-listy NIE są już naruszeniami — usuń je z tests/fixtures/css-anim-allowlist.json (lista ma tylko malić):\n  ' + stale.join('\n  '));
});
test('lint CSS: każdy plik css/*.css jest wykrywany automatycznie (nowy neon.css nie wymyka się lintowi)', () => {
  const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csslint-'));
  try {
    fs.mkdirSync(path.join(dir, 'css')); fs.writeFileSync(path.join(dir, 'css', 'neon.css'), '.led{transition:box-shadow .3s}'); fs.writeFileSync(path.join(dir, 'css', 'inny.txt'), '.x{transition:.2s}');
    const r = lintRepo(dir);
    assert.deepEqual(r.map(v => v.file + ' ' + v.prop), ['css/neon.css box-shadow']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(fs.existsSync(path.join(ROOT, 'css', 'jarvis.css')));
});

/* ---------- zasady statyczne §4.2–4.3: backdrop-filter / drop-shadow / will-change ---------- */
const { lintStatic, lintStaticRepo } = require('../../tools/css-lint.js');
test('lintStatic: backdrop-filter, filter:drop-shadow i will-change są wykrywane (także w @media i z prefiksem), none/auto/blur() nie', () => {
  const r = lintStatic('.a{backdrop-filter:blur(8px)}.b{-webkit-backdrop-filter:blur(2px)}.c{filter:drop-shadow(0 0 4px red)}.d{filter:blur(2px)}.e{will-change:transform}.f{will-change:auto}.g{backdrop-filter:none}@media (max-width:600px){.h{will-change:opacity}}');
  assert.deepEqual(r.map(v => v.kind + ':' + v.where), ['backdrop-filter:.a', 'backdrop-filter:.b', 'drop-shadow:.c', 'will-change:.e', 'will-change:@media (max-width:600px) .h']);
});
test('lint CSS (statyczny): wystąpienia = allow-lista; backdrop-filter tylko .topbar/.dock, drop-shadow nigdzie (ekran startowy od Fazy 6 bez filtrów), will-change nigdzie', () => {
  const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'css-static-allowlist.json'), 'utf8')).entries;
  assert.deepEqual(allow.filter(e => !e.reason || e.reason.length < 12), [], 'wpis bez uzasadnienia');
  const now = lintStaticRepo(ROOT), k = v => [v.file, v.kind, v.where].join(' | ');
  const policy = { 'backdrop-filter': /^(?:\.topbar|\.dock)$/, 'drop-shadow': /^$/, 'will-change': /^$/ };
  const viol = now.filter(v => !policy[v.kind].test(v.where)).map(v => `${k(v)} — ${v.kind} poza dozwolonym zakresem (plan §4: backdrop-filter tylko pasek/dok, drop-shadow nigdzie (ekran startowy od Fazy 6 bez filtrów), will-change ustawia JS na czas gestu)`);
  assert.deepEqual(viol, [], 'naruszenie polityki:\n  ' + viol.join('\n  '));
  const was = new Map(allow.map(e => [k(e), e])), cur = new Map(now.map(v => [k(v), v]));
  const added = [...cur].filter(([x, v]) => !was.has(x) || v.count > was.get(x).count).map(([x, v]) => `${x} ×${v.count}`);
  const stale = [...was].filter(([x, e]) => !cur.has(x) || cur.get(x).count < e.count).map(([x]) => x);
  assert.deepEqual(added, [], 'nowe statyczne filter/backdrop-filter/will-change — dopisz do tests/fixtures/css-static-allowlist.json tylko ze świadomym uzasadnieniem');
  assert.deepEqual(stale, [], 'wpisy allow-listy już nieaktualne — usuń (lista tylko maleje)');
});
