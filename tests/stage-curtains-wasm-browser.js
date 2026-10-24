#!/usr/bin/env node
// stage-curtains 1.2.0 WebAssembly velvet loop, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (same pixels): 112 curtains (8 colors x 7 sizes x stepped on and off) painted with velvetPainter(..., wasm: false) and with the default, read back from the canvas and compared with the picture gate (since 1.4.0 the SIMD kernel works in single precision: 99.5% of the pixels within 5/255 on every channel; stepped curtains take the exact scalar path and must be byte for byte).
// Part 4: a browser without WebAssembly SIMD (simulated: the module constructor throws) must paint the JavaScript curtain, byte for byte.
// Part 2 (speed): the first paint on a freshly loaded page, one fresh page per sample, JavaScript and WebAssembly taking turns: one curtain half at phone size (212 x 892 CSS px at 1.25 = 295,475
// pixels), from the call of velvetPainter to the last row, the start-up of the WebAssembly module included (milliseconds; smaller is better). Also the slowest single step(4) call of such a paint,
// and the median of five warm repeats in the same page (the JavaScript loop warms up, so the gain is for the first paint). Part 3: a page whose policy lacks 'wasm-unsafe-eval' must still paint
// the same pixels (JavaScript where the browser refuses the module).
// Run: node tests/stage-curtains-wasm-browser.js <chromium|firefox|webkit|epiphany> [out.json]
// Env: REPS (default 7), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two). Node is not used for speed numbers.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which)) { console.log('usage: node tests/stage-curtains-wasm-browser.js <chromium|firefox|webkit|epiphany> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 7), SRC = fs.readFileSync(process.env.MODULE || root + 'modules/stage-curtains/stage-curtains.js', 'utf8');
const CSP_WASM = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", CSP_NOWASM = "default-src 'none'; script-src 'self' 'unsafe-inline'";
const CODE = `
function fnv(d) { var h = 2166136261, i; for (i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0; return h; }
function gate(x, y, exact) { if (x.length !== y.length) return false; var n = x.length >> 2, ok = 0, i; for (i = 0; i < x.length; i += 4) { if (exact ? (x[i] === y[i] && x[i + 1] === y[i + 1] && x[i + 2] === y[i + 2] && x[i + 3] === y[i + 3]) : (Math.abs(x[i] - y[i]) <= 5 && Math.abs(x[i + 1] - y[i + 1]) <= 5 && Math.abs(x[i + 2] - y[i + 2]) <= 5 && x[i + 3] === y[i + 3])) ok++; } return exact ? ok === n : ok >= 0.995 * n; }
function bytes(job) { return job.canvas.getContext('2d').getImageData(0, 0, job.canvas.width, job.canvas.height).data; }
function mode(m) {
  var SC = window.StageCurtains, A = [212, 892, 1.25, '#b3202a', 11, false];
  if (m === 'eq') {
    var bases = ['#b3202a', '#e2301f', '#ffd23a', '#8a1010', '#7a5cf0', '#d8d8f0', '#2f7a3a', '#ff8a2a'], geoms = [[212, 892, 1.25], [212, 892, 1], [500, 900, 1], [966, 1000, 1], [100, 300, 1 / 3], [320, 700, 2], [7, 20, 1]], n = 0, bad = 0, engines = {}, bi, gi, st;
    for (bi = 0; bi < bases.length; bi++) for (gi = 0; gi < geoms.length; gi++) for (st = 0; st < 2; st++) {
      var seed = 11 + bi * 23 + gi * 17, g = geoms[gi], a = SC.velvetPainter(g[0], g[1], g[2], bases[bi], seed, !!st, false), c = SC.velvetPainter(g[0], g[1], g[2], bases[bi], seed, !!st);
      a.step(0); c.step(0); engines[c.engine] = (engines[c.engine] || 0) + 1;
      var x = bytes(a), y = bytes(c), d = !gate(x, y, st || c.engine !== 'wasm');
      n++; if (d) bad++;
    }
    return { cases: n, differing: bad, engines: engines, available: SC.wasmAvailable() };
  }
  var useWasm = m === 'wasm', t0 = performance.now(), j = SC.velvetPainter(A[0], A[1], A[2], A[3], A[4], A[5], useWasm ? undefined : false); j.step(0);
  var first = performance.now() - t0, h = fnv(bytes(j)), warm = [], r;
  for (r = 0; r < 5; r++) { var w0 = performance.now(), k = SC.velvetPainter(A[0], A[1], A[2], A[3], A[4] + r + 1, A[5], useWasm ? undefined : false); k.step(0); warm.push(performance.now() - w0); }
  warm.sort(function (p, q) { return p - q; });
  var s = SC.velvetPainter(A[0], A[1], A[2], A[3], A[4], A[5], useWasm ? undefined : false), maxSlice = 0, slices = 0, st0;
  while (true) { st0 = performance.now(); var dn = s.step(4); maxSlice = Math.max(maxSlice, performance.now() - st0); slices++; if (dn) break; }
  return { first: first, hash: h, warm: warm[2], maxSlice: maxSlice, slices: slices, engine: j.engine, available: SC.wasmAvailable() };
}`;
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname === '/stage-curtains.js') { r.setHeader('content-type', 'text/javascript'); return r.end(SRC); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const m = u.searchParams.get('m'), blocked = u.searchParams.get('csp') === 'nowasm', nosimd = u.searchParams.get('nosimd') === '1';
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + (blocked ? CSP_NOWASM : CSP_WASM) + '"><title>t</title><link rel="icon" href="data:,">' + (nosimd ? "<script>WebAssembly.Module = function () { throw new WebAssembly.CompileError('no SIMD'); };</script>" : '') + '<script src="/stage-curtains.js"></script><script>' + CODE + '\ntry{window.__res=mode(' + JSON.stringify(m) + ')}catch(e){window.__res={error:String(e&&e.stack||e)}}</script>');
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
  async function run(m, csp, nosimd) {
    const p = await b.newPage(); await p.goto(base + '/page.html?m=' + m + (csp ? '&csp=' + csp : '') + (nosimd ? '&nosimd=1' : ''));
    let res = null; for (let i = 0; i < 1200 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(100); }
    if (!webkitFamily) await p.close();
    return res || { error: 'no result in 120 s' };
  }
  const t0 = Date.now(), eq = await run('eq', ''), eqBlocked = await run('eq', 'nowasm'), eqNoSimd = await run('eq', '', true);
  const S = { js: [], wasm: [] }, out = { version, reps: REPS, eq, eqBlocked, eqNoSimd }, hashes = { js: new Set(), wasm: new Set() };
  for (let rep = 0; rep < REPS; rep++) for (const v of rep % 2 ? ['wasm', 'js'] : ['js', 'wasm']) { const r = await run(v, ''); if (r.error) { console.log(v + ': ' + r.error); continue; } S[v].push(r); hashes[v].add(r.hash); }
  out.samples = S; out.wallSeconds = (Date.now() - t0) / 1000;
  let pass = !eq.error && !eqBlocked.error && eq.differing === 0 && eqBlocked.differing === 0 && eq.available === true && eq.engines.wasm === eq.cases && hashes.js.size === 1 && hashes.wasm.size === 1 && !eqNoSimd.error && eqNoSimd.differing === 0 && eqNoSimd.engines.js === eqNoSimd.cases && eqNoSimd.available === false && S.js.length === REPS && S.wasm.length === REPS && S.wasm.every((r) => r.engine === 'wasm') && S.js.every((r) => r.engine === 'js');
  console.log('part 1, picture gate (smooth) and exact (stepped), WebAssembly allowed: ' + (eq.error ? 'ERROR ' + eq.error : eq.cases + ' curtains, ' + eq.differing + ' differ, engines ' + JSON.stringify(eq.engines)));
  console.log('part 4, no WebAssembly SIMD (simulated): ' + (eqNoSimd.error ? 'ERROR ' + eqNoSimd.error : eqNoSimd.cases + ' curtains, ' + eqNoSimd.differing + ' differ, wasm available=' + eqNoSimd.available + ' engines ' + JSON.stringify(eqNoSimd.engines)));
  console.log('part 3, policy without the wasm word: ' + (eqBlocked.error ? 'ERROR ' + eqBlocked.error : eqBlocked.cases + ' curtains, ' + eqBlocked.differing + ' differ, wasm available=' + eqBlocked.available + ' engines ' + JSON.stringify(eqBlocked.engines)));
  if (!webkitFamily && !eqBlocked.error) pass = pass && eqBlocked.available === false;
  const m = (v, k) => med(S[v].map((r) => r[k]));
  if (S.js.length && S.wasm.length) {
    out.summary = { firstJs: m('js', 'first'), firstWasm: m('wasm', 'first'), warmJs: m('js', 'warm'), warmWasm: m('wasm', 'warm'), maxSliceJs: m('js', 'maxSlice'), maxSliceWasm: m('wasm', 'maxSlice') };
    console.log('part 2, speed, one phone-size curtain half (295,475 pixels), median of ' + REPS + ' fresh pages (ms; smaller is better; times faster = JavaScript / WebAssembly, bigger is better)');
    console.log('what'.padEnd(46) + 'JavaScript'.padStart(12) + 'WebAssembly'.padStart(13) + 'times faster'.padStart(14));
    for (const [label, k] of [['first paint on a fresh page', 'first'], ['a warm repeat in the same page', 'warm'], ['slowest single step(4) call', 'maxSlice']])
      console.log(label.padEnd(46) + m('js', k).toFixed(1).padStart(12) + m('wasm', k).toFixed(1).padStart(13) + (m('js', k) / m('wasm', k)).toFixed(2).padStart(13) + 'x');
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); console.log(pass ? 'PASS' : 'FAIL'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
