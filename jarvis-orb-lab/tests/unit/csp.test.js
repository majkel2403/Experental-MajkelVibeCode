/* Polityka bezpieczeństwa strony (CSP w index.html) a kod: każdy adres, z którym aplikacja się łączy, musi być przez nią dozwolony.
   Test powstał po błędzie z audytu 2026-10-05: connect-src miał `https:`, ale nie `wss:`, więc WebSocket Binance był blokowany. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const csp = (/Content-Security-Policy"\s+content="([^"]+)"/.exec(html) || [])[1] || '';
const dir = name => ((csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '').split(/\s+/).slice(1));
const allows = (sources, url) => {
  const u = new URL(url);
  return sources.some(s => {
    if (s === "'self'") return false;
    if (/^[a-z]+:$/.test(s)) return u.protocol === s || (s === 'https:' && u.protocol === 'https:');   // samo `https:` NIE obejmuje `wss:`
    const m = /^([a-z]+):\/\/([^/:]+|\*)(?::(\d+|\*))?$/.exec(s); if (!m) return false;
    return m[1] === u.protocol.slice(0, -1) && (m[2] === '*' || m[2] === u.hostname) && (!m[3] || m[3] === '*' || m[3] === (u.port || ''));
  });
};

test('CSP w index.html istnieje i ma connect-src', () => { assert.ok(csp.length > 50); assert.ok(dir('connect-src').length > 3); });

test('każdy WebSocket w kodzie (wss://…) jest dozwolony przez connect-src', () => {
  const found = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js')))
    for (const m of fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').matchAll(/new WebSocket\(\s*['"`](wss?:\/\/[^'"`?$]+)/g)) found.push([f, m[1]]);
  assert.ok(found.length >= 1, 'oczekiwano co najmniej jednego WebSocketu (Binance)');
  const cs = dir('connect-src');
  for (const [f, url] of found) assert.ok(allows(cs, url) || /^ws:\/\/(localhost|127\.0\.0\.1)/.test(url), `${f}: ${url} nie jest dozwolony przez connect-src: ${cs.join(' ')}`);
});

test('samo `https:` nie wystarcza dla wss (pilnuje, żeby test wyżej coś znaczył)', () => {
  assert.equal(allows(['https:'], 'wss://stream.binance.com:9443/x'), false);
  assert.equal(allows(['wss://stream.binance.com:9443'], 'wss://stream.binance.com:9443/stream?streams=a'), true);
  assert.equal(allows(['wss://stream.binance.com:9443'], 'wss://evil.example:9443/x'), false);
});

test('adresy http(s) fetch w kodzie są dozwolone (https: albo lokalne)', () => {
  const cs = dir('connect-src'); const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js')))
    for (const m of fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').matchAll(/fetch\(\s*['"`](https?:\/\/[^'"`?$]+)/g)) if (!allows(cs, m[1]) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(m[1])) bad.push(f + ': ' + m[1]);
  assert.deepEqual(bad, []);
});
