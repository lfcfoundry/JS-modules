#!/usr/bin/env node
// stage-curtains background-worker painter (1.3.0), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (same pixels): both halves of a curtain (212 x 892 CSS px at 1.25x), stepped and smooth, three cloth colors, painted on the page and in the worker: the canvases must be identical, with the page policy allowing
// the worker and with it lacking worker-src blob: (then the worker is refused and the page paints, same pixels). Part 2 (speed, fresh page per reading, versions taking turns): how long the page's thread is busy
// while both halves are painted (sum of the step() calls), the longest single step() call, and the time until both halves are on their canvases (ms, smaller is better). The page-painter steps in slices of 8 ms.
// Run: node tests/stage-curtains-worker-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 7), EARLY=1 starts the worker in idle time first, CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit'].includes(which)) { console.log('usage: node tests/stage-curtains-worker-browser.js <chromium|firefox|webkit> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 7), EARLY = !!process.env.EARLY, SRC = fs.readFileSync(process.env.MODULE || root + 'modules/stage-curtains/stage-curtains.js', 'utf8');
const CSP_WORKER = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:; img-src data: blob:", CSP_NOWORKER = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; img-src data: blob:";
const CODE = `
var COLORS = ['#b3202a', '#1e5aa8', '#e0b020'], PW = 212, H = 892, K = 1.25;
function hashOf(cv) { var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, h = 2166136261, i; for (i = 0; i < d.length; i += 3) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; }
function whenDone(ps, cb) { var t = setInterval(function () { var all = true; ps.forEach(function (p) { if (!p.done) all = p.step(8) && all; }); if (ps.every(function (p) { return p.done; })) { clearInterval(t); cb(); } }, 0); }
function eq(done) {
  var G = window.StageCurtains, jobs = [], tried = 0, bad = 0, names = [], engines = {};
  COLORS.forEach(function (c) { [false, true].forEach(function (st) { [0, 23].forEach(function (off) { jobs.push([c, st, 5 + off]); }); }); });
  var i = 0;
  (function next() {
    if (i >= jobs.length) return done({ tried: tried, differing: bad, names: names, engines: engines });
    var j = jobs[i++], a = G.velvetPainter(PW, H, K, j[0], j[2], j[1], undefined, false), b = G.velvetPainter(PW, H, K, j[0], j[2], j[1], undefined, true);
    while (!a.step(8)) {}
    whenDone([b], function () { tried++; engines[b.engine] = (engines[b.engine] || 0) + 1; if (hashOf(a.canvas) !== hashOf(b.canvas)) { bad++; names.push(j.join(',')); } next(); });
  })();
}
function speed(mode, done) {
  var G = window.StageCurtains, worker = mode === 'worker';
  function go() {
    var ps = [0, 23].map(function (off) { return G.velvetPainter(PW, H, K, '#b3202a', 5 + off, false, undefined, worker); });
    var t0 = performance.now(), busy = 0, longest = 0;
    (function tick() {
      var alive = false;
      ps.forEach(function (p) { if (p.done) return; var a = performance.now(); p.step(8); var d = performance.now() - a; busy += d; if (d > longest) longest = d; if (!p.done) alive = true; });
      if (alive) setTimeout(tick, 0); else done({ busy: busy, longest: longest, ready: performance.now() - t0, engine: ps[0].engine });
    })();
  }
  if (worker && ${EARLY}) { G.startWorker(); setTimeout(go, 150); } else go();
}
`;
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname === '/m.js') { r.setHeader('content-type', 'text/javascript'); return r.end(SRC); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const m = u.searchParams.get('m'), blocked = u.searchParams.get('csp') === 'noworker';
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + (blocked ? CSP_NOWORKER : CSP_WORKER) + '"><title>t</title><link rel="icon" href="data:,"><script src="/m.js"></script><script>' + CODE +
    '\ntry{if(' + JSON.stringify(m) + '==="eq")eq(function(r){window.__res=r});else speed(' + JSON.stringify(m) + ',function(r){window.__res=r})}catch(e){window.__res={error:String(e)}}</script>');
});
const webkitFamily = which === 'webkit', med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], r1 = (x) => Math.round(x * 10) / 10;
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (webkitFamily) { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch('webkitgtk'); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] }); }
  const version = await b.version(); console.log(version);
  async function run(m, csp) {
    const p = await b.newPage(); await p.goto(base + '/page.html?m=' + m + (csp ? '&csp=' + csp : ''));
    let res = null; for (let i = 0; i < 600 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(100); }
    if (!webkitFamily) await p.close();
    return res || { error: 'no result in 60 s' };
  }
  const eq = await run('eq', ''), eqBlocked = await run('eq', 'noworker');
  const acc = { main: { busy: [], longest: [], ready: [] }, worker: { busy: [], longest: [], ready: [] } }, engines = {};
  for (let rep = 0; rep < REPS + 1; rep++) for (const m of rep % 2 ? ['worker', 'main'] : ['main', 'worker']) {
    const r = await run(m, ''); if (r.error) continue; engines[m] = r.engine; if (rep > 0) for (const k of Object.keys(acc[m])) acc[m][k].push(r[k]);
  }
  const speed = {}; for (const m of Object.keys(acc)) { speed[m] = {}; for (const k of Object.keys(acc[m])) speed[m][k] = r1(med(acc[m][k])); }
  const out = { version, reps: REPS, early: EARLY, eq, eqBlocked, speed, engines };
  console.log('same pixels with the worker allowed: ' + (eq.error ? 'ERROR ' + eq.error : eq.tried + ' halves, ' + eq.differing + ' differ; engines ' + JSON.stringify(eq.engines)) + '; worker refused by the page policy: ' + (eqBlocked.error ? 'ERROR ' + eqBlocked.error : eqBlocked.tried + ' halves, ' + eqBlocked.differing + ' differ; engines ' + JSON.stringify(eqBlocked.engines)));
  console.log('both halves, median of ' + REPS + ' fresh pages (ms, smaller is better)' + (EARLY ? ', worker started 150 ms earlier' : ''));
  for (const k of ['busy', 'longest', 'ready']) console.log('  ' + (k === 'busy' ? 'page thread busy' : k === 'longest' ? 'longest single stall' : 'both halves ready').padEnd(22) + 'page ' + String(speed.main[k]).padStart(6) + '   worker ' + String(speed.worker[k]).padStart(6));
  const pass = !eq.error && !eqBlocked.error && eq.differing === 0 && eqBlocked.differing === 0 && eq.engines['worker+wasm'] > 0;
  console.log(pass ? 'PASS' : 'FAIL'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
