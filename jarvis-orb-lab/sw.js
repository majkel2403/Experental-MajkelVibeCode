/* Jarvis OS — service worker: działanie offline (powłoka aplikacji) */
const CACHE = 'jarvis-os-v37';
const SHELL = ['./', 'index.html', 'css/jarvis.css', 'js/core.js', 'js/events.js', 'js/store.js', 'js/registry.js', 'js/mcp-tool-schema.js', 'js/undo.js', 'js/jev-policy.js', 'js/process.js', 'js/apps.js', 'js/apps-settings.js', 'js/widgets.js', 'js/chart.js', 'js/widget-spec.js', 'js/commands.js', 'js/search.js', 'js/commands-ext.js', 'js/commands-data.js', 'js/commands-w4.js', 'js/agents.js', 'js/workflows.js', 'js/workflow-cinema.js', 'js/film-scenarios.js', 'js/context.js', 'js/judge.js', 'js/jev-flow.js', 'js/ai.js', 'js/bridge.js', 'js/hud.js', 'js/dash.js', 'js/main.js', 'assets/wallpaper.jpg', 'assets/icon.svg', 'manifest.webmanifest'];

const SHELL_SET = new Set(SHELL);
const BASE = new URL('./', self.location).pathname;   // GitHub Pages: /Jarvis-/, lokalnie: /

self.addEventListener('install', e => {
  /* plik po pliku zamiast addAll: jedna literówka na liście (albo brak pliku) nie wyłącza już całego trybu offline */
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(err => console.warn('[sw] nie zbuforowano', u, err)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// własne pliki: najpierw sieć (świeże wdrożenia), w razie braku sieci — cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  /* do cache trafiają tylko pliki powłoki (stała lista), zapisane pod adresem BEZ parametrów — wcześniej każdy adres z ?wersją
     dokładał osobny wpis i cache rósł bez końca */
  const path = url.pathname.replace(BASE, '') || './';
  const shell = SHELL_SET.has(path) || (e.request.mode === 'navigate' && path === 'index.html');
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && shell) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(url.origin + url.pathname, copy))); }
      return res;
    }).catch(() => caches.match(url.origin + url.pathname).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))   // strona zastępcza tylko dla nawigacji, nie dla skryptów
  );
});
