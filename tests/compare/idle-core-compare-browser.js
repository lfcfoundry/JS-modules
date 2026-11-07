#!/usr/bin/env node
// idle-core against break_infinity.js on the two sums an idle game runs on every Buy button: "price of n more copies" and "how many copies can I afford". Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules holding puppeteer-core and break_infinity.js> CHROMIUM=... | FIREFOX=... | WEBKIT=1 [R=7 rounds] node tests/compare/idle-core-compare-browser.js
// One library per page, order swapped every round. The library is only measured here, never copied into this repository. break_infinity.js is for numbers past 1e300, which idle-core cannot hold, so this measures only the range both can do (numbers below 1e300): it is a speed and size comparison, not a claim that idle-core can replace it. Exit 2 when it cannot run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT'); process.exit(2); }
const NM = fs.existsSync(path.join(process.env.LIBS, 'node_modules')) ? path.join(process.env.LIBS, 'node_modules') : process.env.LIBS;
const pp = require(path.join(NM, 'puppeteer-core')), rd = (f) => fs.readFileSync(f, 'utf8');
const SRC = { 'idle-core': rd(path.resolve(__dirname, '../../modules/idle-core/idle-core.js')), 'break_infinity.js': rd(path.join(NM, 'break_infinity.js/dist/break_infinity.min.js')) };
const MIN = path.resolve(__dirname, '../../modules/idle-core/idle-core.min.js');
const sz = (s) => s.length + ' B (' + zlib.gzipSync(Buffer.from(s), { level: 9 }).length + ' gzipped)';
// Runs inside the page: microseconds per call, median of 7 timings of 20,000 calls.
function bench(which, src) {
  const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); const L = m.exports;
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  let cost, afford, check;
  if (which === 'idle-core') {
    cost = () => L.costOfMany(15, 15, 3, 10); afford = () => L.maxAffordable(15, 15, 3, 5000);
    check = [cost(), afford()];
  } else {
    const D = L.default || L.Decimal || L;
    cost = () => D.sumGeometricSeries(10, 15, 1.15, 3); afford = () => D.affordGeometricSeries(5000, 15, 1.15, 3);
    check = [cost().toNumber(), afford().toNumber()];
  }
  const t = (f) => { for (let i = 0; i < 2000; i++) f(); const r = []; for (let k = 0; k < 7; k++) { const t0 = performance.now(); for (let i = 0; i < 20000; i++) f(); r.push((performance.now() - t0) / 20000 * 1000); } return med(r); };
  return { cost: t(cost), afford: t(afford), check };
}
(async () => {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>x</title><body>'); }); await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1]);
  const R = +process.env.R || 5, med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  console.log('sizes: idle-core.min.js ' + (fs.existsSync(MIN) ? sz(rd(MIN)) : 'not built') + '; break_infinity.min.js ' + sz(SRC['break_infinity.js']));
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await require('../webkit-shim.js').launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const names = Object.keys(SRC), got = {};
    for (let k = 0; k < R; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) {
      const p = await b.newPage(); await p.goto(url);
      (got[n] = got[n] || []).push(await p.evaluate(bench, n, SRC[n])); if (p.close) await p.close();
    }
    for (const n of names) console.log('  ' + n.padEnd(20) + 'price of 10 more copies ' + med(got[n].map(x => x.cost)).toFixed(3) + ' us | copies 5,000 buys ' + med(got[n].map(x => x.afford)).toFixed(3) + ' us | answers ' + JSON.stringify(got[n][0].check.map(x => +x.toFixed(2))));
    await b.close();
  }
  srv.close(); process.exit(0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
