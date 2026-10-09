#!/usr/bin/env node
// Neural Workflow server: Event Bus ingress -> Event Store -> live fan-out to viewers, plus REPLAY.
//
//   Producers (Hermes / Jarvis) send events by any of:
//     - WebSocket  ws://HOST:PORT/ingest        (one JSON event per message)
//     - HTTP       POST /events                 (one JSON object, an array, or JSONL body)
//     - STDIN      node server/server.mjs --stdin   (JSONL lines, e.g. piped from a process log)
//   INGEST_TOKEN=<secret> requires `Authorization: Bearer <secret>` (or ?token=) on POST /events and ws /ingest;
//   set it whenever HOST is not 127.0.0.1.
//   Viewers:
//     - GET  /                                  the viewer (web/)
//     - GET  /api/runs                          list of runs (recorded + demo)
//     - GET  /api/runs/:run                     full event log of a run (JSONL) for REPLAY
//     - WS   ws://HOST:PORT/live?run=<id|*>     live events as they are recorded
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { WebSocketServer } from 'ws';
import { createStore } from './store.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PORT || 4777);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.INGEST_TOKEN || '';
if (!TOKEN && HOST !== '127.0.0.1' && HOST !== 'localhost') console.warn('warning: HOST=' + HOST + ' without INGEST_TOKEN — anyone on the network can write events');
const authorized = (req, url) => !TOKEN || req.headers.authorization === 'Bearer ' + TOKEN || url.searchParams.get('token') === TOKEN;
const store = createStore(path.join(ROOT, 'data', 'runs'), [path.join(ROOT, 'demo', 'runs')]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jsonl': 'application/x-ndjson; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };

const viewers = new Set();
function broadcast(ev) {
  const msg = JSON.stringify(ev);
  for (const v of viewers) if (v.readyState === 1 && (v.run === '*' || v.run === ev.run)) v.send(msg);
}
function ingest(raw) {
  const r = store.append(raw);
  if (r.ok) broadcast(r.event);
  return r;
}

function serveStatic(req, res, rel) {
  const allowed = [path.join(ROOT, 'web'), path.join(ROOT, 'packages')];
  const file = path.normalize(path.join(ROOT, rel));
  if (!allowed.some((a) => file.startsWith(a + path.sep))) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (req.method === 'POST' && p === '/events') {
    if (!authorized(req, url)) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'unauthorized' })); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      let items = [];
      try {
        const s = body.trim();
        if (s.startsWith('[')) items = JSON.parse(s);
        else if (s.startsWith('{') && !s.includes('\n')) items = [JSON.parse(s)];
        else items = s.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
      } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'invalid JSON' })); }
      const out = items.map(ingest);
      const bad = out.filter((r) => !r.ok).map((r) => r.error);
      res.writeHead(bad.length ? 207 : 202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ accepted: out.length - bad.length, rejected: bad }));
    });
    return;
  }
  if (p === '/api/runs') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(store.list())); }
  if (p.startsWith('/api/runs/')) {
    const r = store.get(p.slice('/api/runs/'.length));
    if (!r) { res.writeHead(404); return res.end('no such run'); }
    res.writeHead(200, { 'content-type': MIME['.jsonl'] });
    return res.end(r.events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }
  if (p === '/' || p === '/index.html') return serveStatic(req, res, 'web/index.html');
  if (p.startsWith('/web/') || p.startsWith('/packages/')) return serveStatic(req, res, p.slice(1));
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/live' && url.pathname !== '/ingest') return sock.destroy();
  if (url.pathname === '/ingest' && !authorized(req, url)) { sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return sock.destroy(); }
  wss.handleUpgrade(req, sock, head, (ws) => {
    if (url.pathname === '/live') {
      ws.run = url.searchParams.get('run') || '*';
      viewers.add(ws);
      ws.on('close', () => viewers.delete(ws));
    } else {
      ws.on('message', (m) => {
        let raw;
        try { raw = JSON.parse(String(m)); } catch (e) { ws.send(JSON.stringify({ ok: false, error: 'invalid JSON' })); return; }
        const r = ingest(raw);
        if (!r.ok) ws.send(JSON.stringify({ ok: false, error: r.error }));
      });
    }
  });
});

if (process.argv.includes('--stdin')) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => { if (!line.trim()) return; try { const r = ingest(JSON.parse(line)); if (!r.ok) console.error('rejected:', r.error); } catch (e) { console.error('invalid JSON line'); } });
}

server.listen(PORT, HOST, () => console.log(`Neural Workflow on http://${HOST}:${PORT}  (ingest: POST /events · ws /ingest · --stdin)`));
