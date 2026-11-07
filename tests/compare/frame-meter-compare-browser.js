#!/usr/bin/env node
// frame-kit FrameMeter against Stats.js 0.17.0: what one frame of measuring costs, with Stats.js's panel on the page (it draws it every frame) and FrameMeter reading the same numbers as text. Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules holding puppeteer-core and stats.js> CHROMIUM=... | FIREFOX=... | WEBKIT=1 [R=5 rounds] node tests/compare/frame-meter-compare-browser.js
// One library per page, order swapped every round, a plain loop (no requestAnimationFrame) so only the library's own work is timed. The library is only measured here, never copied into this repository. Exit 2 when it cannot run.
// Not the same job: Stats.js also draws its graph (that drawing is its main cost), FrameMeter only counts and keeps text; the page draws it. The numbers show what each costs a frame, not that one does the other's work.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT'); process.exit(2); }
const NM = fs.existsSync(path.join(process.env.LIBS, 'node_modules')) ? path.join(process.env.LIBS, 'node_modules') : process.env.LIBS;
const pp = require(path.join(NM, 'puppeteer-core')), rd = (f) => fs.readFileSync(f, 'utf8');
const SRC = { 'frame-meter': rd(path.resolve(__dirname, '../../modules/frame-kit/frame-meter.js')), 'stats.js': rd(path.join(NM, 'stats.js/build/stats.min.js')), 'none': '' };
// Runs inside the page: nanoseconds per frame (median of 9 timings of 20,000 frames).
function bench(which, src) {
  const m = { exports: {} }; if (src) new Function('module', 'exports', src).call(window, m, m.exports);
  const L = typeof m.exports === 'function' || Object.keys(m.exports).length ? m.exports : (window.Stats || window.FrameMeter);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  let frame;
  if (which === 'frame-meter') { const FM = L.FrameMeter || L; const meter = new FM(); let t = 1000; frame = () => { t += 16.7; meter.frame(t, 4, 16.7); }; }
  else if (which === 'stats.js') { const S = L.default || L; const s = new S(); s.showPanel(0); document.body.appendChild(s.dom); frame = () => { s.begin(); s.end(); }; }
  else { let t = 1000; frame = () => { t += 16.7; }; }
  for (let i = 0; i < 2000; i++) frame();
  const r = []; for (let k = 0; k < 9; k++) { const t0 = performance.now(); for (let i = 0; i < 20000; i++) frame(); r.push((performance.now() - t0) / 20000 * 1e6); }
  return med(r);
}
(async () => {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>x</title><body>'); }); await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1]);
  const R = +process.env.R || 5, med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await require('../webkit-shim.js').launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const names = Object.keys(SRC), got = {};
    for (let k = 0; k < R; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) {
      const p = await b.newPage(); await p.goto(url);
      try { (got[n] = got[n] || []).push(await p.evaluate(bench, n, SRC[n])); } catch (e) { console.log('  ' + n + ' failed: ' + String(e.message).split('\n')[0]); }
      if (p.close) await p.close();
    }
    console.log('  per frame, ns: ' + names.filter(n => got[n] && got[n].length).map(n => n + ' ' + med(got[n]).toFixed(0)).join(' | '));
    await b.close();
  }
  srv.close(); process.exit(0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
