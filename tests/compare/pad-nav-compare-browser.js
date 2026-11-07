#!/usr/bin/env node
// pad-nav against js-spatial-navigation: time for one focus move among 1,000 buttons (arrow or D-pad right, then left, alternating). Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules holding puppeteer-core and js-spatial-navigation> CHROMIUM=... | FIREFOX=... | WEBKIT=1 [R=7 rounds] [PADFILE=another copy of pad-nav.js to try] node tests/compare/pad-nav-compare-browser.js
// One library per page, order swapped every round. The library is only measured here, never copied into this repository. Exit 2 when it cannot run.
// pad-nav reads a (fake) pad each step and moves the ring; js-spatial-navigation moves real focus from a call to move(). Both end with the next button focused or ringed, so the work compared is "find the next button and show it".
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT'); process.exit(2); }
const LIBS = process.env.LIBS, NM = fs.existsSync(path.join(LIBS, 'node_modules')) ? path.join(LIBS, 'node_modules') : LIBS;
const pp = require(path.join(NM, 'puppeteer-core')), rd = (f) => fs.readFileSync(f, 'utf8');
const SRC = { 'pad-nav': rd(path.resolve(__dirname, '../../modules/pad-nav/pad-nav.js')), 'js-spatial-navigation': rd(path.join(NM, 'js-spatial-navigation/spatial_navigation.js')) };
if (process.env.PADFILE) SRC['pad-nav (PADFILE)'] = rd(process.env.PADFILE);
const PAGE = '<!doctype html><title>x</title><style>body{margin:0}#g{width:1500px}#g button{width:60px;height:30px;margin:0;padding:0;float:left;box-sizing:border-box}.pad-focus{outline:2px solid red}</style><body><div id="g"></div>';
// Runs inside the page: builds 1,000 buttons in a 25 by 40 grid, then times N moves, M times; returns the median microseconds per move.
function bench(which, src, N, M) {
  const g = document.getElementById('g'); let h = ''; for (let i = 0; i < 1000; i++) h += '<button class="b" id="b' + i + '">' + i + '</button>'; g.innerHTML = h;
  (0, eval)(src);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  let move, ok = () => true;
  if (which.indexOf('pad-nav') === 0) {
    const pad = { id: 'p', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [] };
    for (let i = 0; i < 17; i++) pad.buttons.push({ pressed: false, value: 0 });
    const pn = new PadNav({ getScope: () => g, getPads: () => [pad] });
    let T = 0, dir = 15;
    const press = (b) => { pad.buttons[b].pressed = true; pad.buttons[b].value = 1; T += 1000; pn.step(T); pad.buttons[b].pressed = false; pad.buttons[b].value = 0; T += 1000; pn.step(T); };
    press(15); press(15);   // wake the ring, put it on a button
    move = (i) => { press(i & 1 ? 14 : 15); };
    ok = () => !!document.querySelector('.pad-focus');
  } else {
    SpatialNavigation.init(); SpatialNavigation.add({ selector: '.b' }); SpatialNavigation.focus();
    move = (i) => { SpatialNavigation.move(i & 1 ? 'left' : 'right'); };
    ok = () => document.activeElement && document.activeElement.className === 'b';
  }
  for (let i = 0; i < 20; i++) move(i);
  if (!ok()) return -1;
  const t = [];
  for (let m = 0; m < M; m++) { const t0 = performance.now(); for (let i = 0; i < N; i++) move(i); t.push((performance.now() - t0) / N * 1000); }
  return med(t);
}
(async () => {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); }); await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1]);
  const R = +process.env.R || 7, med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await require('../webkit-shim.js').launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const names = Object.keys(SRC), got = {};
    for (let k = 0; k < R; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) {
      const p = await b.newPage(); await p.goto(url);
      const us = await p.evaluate(bench, n, SRC[n], 100, 5);
      (got[n] = got[n] || []).push(us); if (p.close) await p.close();
    }
    for (const n of names) console.log('  ' + n.padEnd(24) + 'one focus move among 1,000 buttons ' + (med(got[n]) < 0 ? 'FAILED to move' : med(got[n]).toFixed(1) + ' us') + '  (rounds: ' + got[n].map(x => x.toFixed(0)).join(' ') + ')');
    await b.close();
  }
  srv.close(); process.exit(0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
