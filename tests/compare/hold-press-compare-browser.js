#!/usr/bin/env node
// hold-press against long-press-event 2.5.2: cost of one quick press-and-release (a tap) with 12 buttons set up, and how late the hold fires after its delay. Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules holding puppeteer-core and long-press-event> CHROMIUM=... | FIREFOX=... | WEBKIT=1 [R=5 rounds] node tests/compare/hold-press-compare-browser.js
// One library per page, order swapped every round. The library is only measured here, never copied into this repository. Both listen for pointer events here (long-press-event uses pointer events whenever the browser has them, and waits with requestAnimationFrame; hold-press uses a timer), so all get the same synthetic pointerdown and pointerup. Exit 2 when it cannot run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT'); process.exit(2); }
const NM = fs.existsSync(path.join(process.env.LIBS, 'node_modules')) ? path.join(process.env.LIBS, 'node_modules') : process.env.LIBS;
const pp = require(path.join(NM, 'puppeteer-core')), rd = (f) => fs.readFileSync(f, 'utf8');
const SRC = { 'hold-press': rd(path.resolve(__dirname, '../../modules/hold-press/hold-press.js')), 'long-press-event': rd(path.join(NM, 'long-press-event/dist/long-press-event.min.js')), 'none (events only)': '' };
// Runs inside the page: returns { tap: microseconds per press-and-release, late: ms after the 400 ms delay, fired }.
async function bench(which, src) {
  if (src) (0, eval)(src);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const btns = []; for (let i = 0; i < 12; i++) { const b = document.createElement('button'); b.textContent = 'b' + i; if (which === 'long-press-event') b.setAttribute('data-long-press-delay', '400'); document.body.appendChild(b); btns.push(b); }
  let fires = 0, firedAt = 0;
  if (which === 'hold-press') btns.forEach((b) => HoldPress.attach(b, { delayMs: 400, everyMs: 5000, onPress: () => { fires++; if (!firedAt) firedAt = performance.now(); } }));
  if (which === 'long-press-event') btns.forEach((b) => b.addEventListener('long-press', () => { fires++; if (!firedAt) firedAt = performance.now(); }));
  const down = (b) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: 5, clientY: 5 }));
  const up = (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: 5, clientY: 5 }));
  const tap = () => { for (let i = 0; i < 12; i++) { down(btns[i]); up(btns[i]); } };
  for (let i = 0; i < 20; i++) tap();
  const t = []; for (let k = 0; k < 9; k++) { const t0 = performance.now(); for (let i = 0; i < 200; i++) tap(); t.push((performance.now() - t0) / (200 * 12) * 1000); }
  const late = [];
  if (which !== 'none (events only)') for (let k = 0; k < 4; k++) {
    fires = 0; firedAt = 0; const t0 = performance.now(); down(btns[0]);
    await new Promise((r) => setTimeout(r, 650)); up(btns[0]); await new Promise((r) => setTimeout(r, 50));
    if (firedAt) late.push(firedAt - t0 - 400);
  }
  return { tap: med(t), late: late.length ? med(late) : null, fired: late.length };
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
    for (const n of names) if (got[n] && got[n].length) { const l = got[n].map(x => x.late).filter(x => x !== null); console.log('  ' + n.padEnd(20) + 'one tap (down+up), us: ' + med(got[n].map(x => x.tap)).toFixed(2) + ' | hold fires after the 400 ms delay by, ms: ' + (l.length ? med(l).toFixed(1) : 'n/a') + ' (fired in ' + got[n].reduce((a, x) => a + x.fired, 0) + ' of ' + got[n].length * 4 + ' presses)'); }
    await b.close();
  }
  srv.close(); process.exit(0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
