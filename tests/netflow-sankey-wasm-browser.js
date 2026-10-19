#!/usr/bin/env node
// netflow-sankey order search, plain JavaScript against WebAssembly (2.3.0), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (equality): 48 nets (weighted and unweighted; with loops and long links) laid out with WebAssembly (the default) and with { wasm: false }: the layouts must be identical. Part 2 (speed): five nets from
// 70 to 1,000 bars, a layout takes (ms per layout, smaller is better), versions taking turns in rotating order, 10 layouts per reading because WebKit's clock moves in whole milliseconds; and the first layout on a
// fresh page. Part 3: a page whose policy lacks 'wasm-unsafe-eval' must lay out the same on the plain code.
// Run: node tests/netflow-sankey-wasm-browser.js <chromium|firefox|webkit|epiphany> [out.json]     Env: REPS (default 5), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two), MODULE=/path/to/another/netflow-sankey.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which)) { console.log('usage: node tests/netflow-sankey-wasm-browser.js <chromium|firefox|webkit|epiphany> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 5), SRC = fs.readFileSync(process.env.MODULE || root + 'modules/netflow-sankey/netflow-sankey.js', 'utf8');
const CSP_WASM = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", CSP_NOWASM = "default-src 'none'; script-src 'self' 'unsafe-inline'";
const CODE = `
function rng(seed) { var s = seed | 0; return function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function dense(nl, per, deg, seed, loops, longs) { var r = rng(seed), links = [], k, j, q, a; for (k = 0; k + 1 < nl; k++) for (j = 0; j < per; j++) for (q = 0; q < deg; q++) links.push({ from: 'S' + k + ' i' + j, to: 'S' + (k + 1) + ' i' + Math.floor(r() * per), value: 1 + Math.floor(r() * r() * 40) });
  for (q = 0; q < loops; q++) { a = 2 + Math.floor(r() * (nl - 2)); links.push({ from: 'S' + a + ' i' + Math.floor(r() * per), to: 'S' + Math.floor(r() * a) + ' i' + Math.floor(r() * per), value: 3 }); }
  for (q = 0; q < longs; q++) links.push({ from: 'S0 i' + Math.floor(r() * per), to: 'S' + (nl - 1) + ' i' + Math.floor(r() * per), value: 2 });
  return { links: links }; }
var BATCH = 10, SCENES = { 'small 70 bars': [7, 10, 2, 3, 0], 'medium 240 bars': [6, 40, 4, 0, 0], 'dense 320 bars': [8, 40, 5, 3, 4], 'large 640 bars': [8, 80, 4, 1, 3], 'big 1000 bars': [10, 100, 3, 4, 4] };
function same(a, b) { return JSON.stringify(a, function (k, v) { return k === 'ms' ? 0 : v; }) === JSON.stringify(b, function (k, v) { return k === 'ms' ? 0 : v; }); }
function mode(m) {
  var G = window.NetflowSankey, name, res = {}, bad = 0, tried = 0, names = [];
  var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; };
  if (m === 'eq') {
    [[3,3,2,0,0],[4,6,2,1,0],[6,20,4,2,1],[6,40,4,0,0],[8,40,5,3,4],[8,80,4,1,3],[10,100,3,4,4],[12,150,2,2,2]].forEach(function (c) { [1, 2, 3].forEach(function (seed) { [false, true].forEach(function (unw) { var inp = dense(c[0], c[1], c[2], seed, c[3], c[4]), o = { budgetMs: 1e9, unweighted: unw }; tried++; if (!same(G.layoutFlows(inp, Object.assign({ wasm: false }, o)), G.layoutFlows(inp, o))) { bad++; names.push(c.join('x') + '/' + seed + '/' + unw); } }); }); });
    return { tried: tried, differing: bad, names: names, available: G.wasmAvailable() };
  }
  if (m === 'speed') {
    Object.keys(SCENES).forEach(function (n) {
      var c = SCENES[n], inp = dense(c[0], c[1], c[2], 9, c[3], c[4]), tj = [], tw = [], rep, o, t0, ref = G.layoutFlows(inp, { budgetMs: 1e9, wasm: false });
      for (rep = 0; rep < REPSN + 1; rep++) { var order = rep % 2 ? ['w', 'j'] : ['j', 'w']; for (o = 0; o < 2; o++) { var oo = order[o] === 'w' ? { budgetMs: 1e9 } : { budgetMs: 1e9, wasm: false }, out, z; t0 = performance.now(); for (z = 0; z < BATCH; z++) out = G.layoutFlows(inp, oo); var dt = (performance.now() - t0) / BATCH; if (!same(out, ref)) throw new Error('layout differs in ' + n); if (rep > 0) (order[o] === 'w' ? tw : tj).push(dt); } }
      res[n] = { js: +med(tj).toFixed(1), wasm: +med(tw).toFixed(1) };
    });
    return { speed: res };
  }
  if (m === 'cold-js' || m === 'cold-wasm') { var inp2 = dense(6, 40, 4, 9, 0, 0), t1 = performance.now(); G.layoutFlows(inp2, m === 'cold-js' ? { budgetMs: 1e9, wasm: false } : { budgetMs: 1e9 }); return { first: performance.now() - t1 }; }
  return { error: 'unknown mode ' + m };
}`.replace('REPSN', String(REPS));
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname === '/m.js') { r.setHeader('content-type', 'text/javascript'); return r.end(SRC); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const m = u.searchParams.get('m'), blocked = u.searchParams.get('csp') === 'nowasm';
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + (blocked ? CSP_NOWASM : CSP_WASM) + '"><title>t</title><link rel="icon" href="data:,"><script src="/m.js"></script><script>' + CODE + '\ntry{var __m=' + JSON.stringify(m) + ';if(__m.indexOf("idle-")===0)setTimeout(function(){try{window.__res=mode("cold-"+__m.slice(5))}catch(e){window.__res={error:String(e)}}},250);else window.__res=mode(__m)}catch(e){window.__res={error:String(e&&e.stack||e)}}</script>');
});
const webkitFamily = which === 'webkit' || which === 'epiphany', med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (webkitFamily) { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] }); }
  const version = await b.version(); console.log(version);
  async function run(m, csp) {
    const p = await b.newPage(); await p.goto(base + '/page.html?m=' + m + (csp ? '&csp=' + csp : ''));
    let res = null; for (let i = 0; i < 1200 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(100); }
    if (!webkitFamily) await p.close();
    return res || { error: 'no result in 120 s' };
  }
  const coldOnly = !!process.env.COLD_ONLY, t0 = Date.now(), eq = coldOnly ? {} : await run('eq', ''), eqBlocked = coldOnly ? {} : await run('eq', 'nowasm'), sp = coldOnly ? {} : await run('speed', '');
  const cold = { js: [], wasm: [] };
  for (let rep = 0; rep < REPS + 2; rep++) for (const v of rep % 2 ? ['wasm', 'js'] : ['js', 'wasm']) { const r = await run('cold-' + v, ''); if (!r.error) cold[v].push(r.first); }
  const idle = { js: [], wasm: [] };   // the first layout 250 ms after the page loaded (the wasm has had time to compile in the background)
  for (let rep = 0; rep < REPS + 2; rep++) for (const v of rep % 2 ? ['wasm', 'js'] : ['js', 'wasm']) { const r = await run('idle-' + v, ''); if (!r.error) idle[v].push(r.first); }
  const out = { version, reps: REPS, eq, eqBlocked, speed: sp.speed, cold: { jsMs: med(cold.js), wasmMs: med(cold.wasm) }, idle: { jsMs: med(idle.js), wasmMs: med(idle.wasm) }, wallSeconds: (Date.now() - t0) / 1000 };
  let pass = !eq.error && !eqBlocked.error && !sp.error && eq.differing === 0 && eqBlocked.differing === 0 && eq.available === true;
  if (!webkitFamily && !eqBlocked.error) pass = pass && eqBlocked.available === false;
  console.log('same layouts: ' + (eq.error ? 'ERROR ' + eq.error : eq.tried + ' layouts, ' + eq.differing + ' differ ' + (eq.names || []).join(',')) + '; no-wasm policy: ' + (eqBlocked.error ? 'ERROR ' + eqBlocked.error : eqBlocked.tried + ', ' + eqBlocked.differing + ' differ'));
  if (sp.speed) { console.log('scene'.padEnd(18) + 'JS ms'.padStart(8) + 'wasm ms'.padStart(9) + 'times faster'.padStart(14)); for (const [k, v] of Object.entries(sp.speed)) console.log(k.padEnd(18) + String(v.js).padStart(8) + String(v.wasm).padStart(9) + ((v.js / v.wasm).toFixed(2) + 'x').padStart(14)); console.log('first layout on a fresh page: JS ' + out.cold.jsMs.toFixed(1) + ' ms, wasm ' + out.cold.wasmMs.toFixed(1) + ' ms'); }
  console.log(pass ? 'PASS' : 'FAIL');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
