/* Prawdziwe odpowiedzi serwisów (tests/fixtures/api, zapisane 2026-10-04) przepuszczone przez kod Jarvisa.
   Atrapy kopert nie wyłapią zmiany formatu po stronie Open-Meteo / CoinGecko / Binance — te testy tak.
   Odświeżenie danych: te same adresy co w js/apps.js (J.weather.geocode/fetch, J.market fetchCG, strumień Binance). */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('../harness.js');

const FX = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'api', f), 'utf8'));
const geo = FX('open-meteo-geocode.json'), fc = FX('open-meteo-forecast.json'), cg = FX('coingecko-markets.json'), bn = FX('binance-miniticker.json');
const res = body => ({ ok: true, status: 200, json: async () => body });
const fetch = async url => {
  url = String(url);
  if (url.includes('geocoding-api.open-meteo.com')) return res(geo);
  if (url.includes('api.open-meteo.com/v1/forecast')) return res(fc);
  if (url.includes('api.coingecko.com/api/v3/coins/markets')) return res(cg);
  throw new TypeError('nieoczekiwany adres w teście: ' + url);
};
const mk = () => load({ fetch, state: { settings: { hermesOn: false, city: 'Wrocław', lat: 51.1079, lon: 17.0385 } } });

test('Open-Meteo (prawdziwa odpowiedź): geokodowanie i prognoza dają liczby, 6 dni i polską odpowiedź narzędzia', async () => {
  const J = mk();
  const g = await J.weather.geocode('Wrocław');
  assert.equal(g.city, geo.results[0].name); assert.equal(typeof g.lat, 'number'); assert.equal(typeof g.lon, 'number');
  const d = await J.weather.fetch();
  assert.equal(typeof d.current.temperature_2m, 'number', 'aktualna temperatura');
  assert.equal(typeof d.current.weather_code, 'number');
  assert.equal(d.daily.time.length, 6, '6 dni prognozy'); assert.equal(d.daily.temperature_2m_max.length, 6);
  assert.ok(Array.isArray(d.hourly?.time) && d.hourly.time.length > 0, 'prognoza godzinowa');
  const r = await J.registry.run('get_weather', {}, { source: 'hermes' });
  assert.equal(r.ok, true, r.text); assert.match(r.text, /°C/); assert.match(r.text, new RegExp(String(Math.round(fc.current.temperature_2m))));
});

test('CoinGecko (prawdziwa odpowiedź): ceny, zmiana 24 h i wykres trafiają do monitora rynku i narzędzia', async () => {
  const J = mk();
  await J.market.ensure();
  const btc = cg.find(x => x.id === 'bitcoin');
  assert.equal(J.market.data.BTC.price, btc.current_price);
  assert.equal(J.market.data.BTC.chg, btc.price_change_percentage_24h);
  assert.ok(J.market.data.BTC.spark.length > 10, 'wykres z sparkline_in_7d');
  assert.equal(J.market.source, 'CoinGecko');
  const r = await J.registry.run('get_crypto_prices', {}, { source: 'hermes' });
  assert.equal(r.ok, true, r.text); assert.match(r.text, /BTC/);
});

test('Binance (prawdziwe wiadomości strumienia miniTicker): cena na żywo, kierunek i etykieta źródła', async () => {
  const J = mk();
  let sock = null;
  J.__ctx.WebSocket = class { constructor(url) { this.url = url; sock = this; } close() { this.closed = true; } };
  await J.market.ensure();
  J.market.subscribe();
  assert.ok(sock && /stream\.binance\.com/.test(sock.url) && /btcusdt@miniTicker/.test(sock.url), 'subskrypcja właściwych strumieni');
  sock.onopen?.();
  assert.equal(J.market.source, 'Binance · na żywo');
  const m = bn.find(x => x.data.s === 'BTCUSDT');
  sock.onmessage({ data: JSON.stringify(m) });
  assert.equal(J.market.data.BTC.price, +m.data.c); assert.equal(J.market.data.BTC.live, true);
  assert.ok(Math.abs(J.market.data.BTC.chg - (+m.data.c - +m.data.o) / +m.data.o * 100) < 1e-9, 'zmiana liczona od otwarcia doby');
  sock.onclose?.({ target: sock });   // zerwanie: etykieta przestaje mówić „na żywo”
  assert.equal(J.market.data.BTC.live, false); assert.notEqual(J.market.source, 'Binance · na żywo');
  J.market.unsubscribe();
});
