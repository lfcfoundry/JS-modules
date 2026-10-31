#!/usr/bin/env node
// text-columns WebAssembly memory left behind after a big file (read from each live instance, page and helpers), and what the fixes cost:
// the number scratch sized by rows (0.6.2) against by fields (0.6.1, _numRoom: 'fields'), and idleTrim (a fresh small memory after an idle time), alone and stacked.
// Run: node tests/text-columns-memory-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 5), ONLY (JSON list of mode names)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 5);
const MAKE = `window.make = function (mb) { var s = 7, rnd = function () { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }, parts = ['a,b,c,d,e,f,g,h\\n'], n = 0, i, L;
  while (n < mb * 1e6) { L = []; for (i = 0; i < 2000; i++) L.push([(rnd() * 1e6 | 0), (rnd() * 1000).toFixed(3), (rnd() * 100 - 50).toFixed(2), (rnd() * 9 | 0), (rnd() * 1e5).toFixed(1), (rnd() * 2).toFixed(4), (rnd() * 3e4 | 0), (rnd() * 77).toFixed(2)].join(',')); L = L.join('\\n') + '\\n'; parts.push(L); n += L.length; }
  return new TextEncoder().encode(parts.join('')); };
window.makeText = function (mb) { var s = 9, rnd = function () { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }, W = ['alpha', 'beta', 'gamma', 'delta', 'north', 'south', 'river', 'stone', 'maple', 'cedar'], parts = ['id,name,city,score,note\\n'], n = 0, i, L;
  while (n < mb * 1e6) { L = []; for (i = 0; i < 2000; i++) L.push([(rnd() * 1e6 | 0), W[rnd() * 10 | 0] + (rnd() * 1e4 | 0), W[rnd() * 10 | 0], (rnd() * 100).toFixed(2), W[rnd() * 10 | 0] + ' ' + W[rnd() * 10 | 0] + ' ' + (rnd() * 1e5 | 0)].join(',')); L = L.join('\\n') + '\\n'; parts.push(L); n += L.length; }
  return new Blob([parts.join('')]); };`;
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/tc.js': fs.readFileSync(root + 'text-columns/text-columns.js', 'utf8'), '/make.js': MAKE, '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/tc.js"></script><script src="/make.js"></script>' });
  const p = await b.newPage();
  const R16 = 16777216, MODES = { '0.6.1 (scratch by fields)': { o: { _numRoom: 'fields', _sliceBuild: false }, trim: -1 }, 'scratch by rows': { o: {}, trim: -1 }, 'idle trim to 0 alone': { o: { _numRoom: 'fields', _sliceBuild: false }, trim: 300 }, 'idle trim to 16 MB alone': { o: { _numRoom: 'fields', _sliceBuild: false }, trim: 300, keep: R16 }, 'rows + trim to 0': { o: {}, trim: 300 }, 'rows + trim to 16 MB': { o: {}, trim: 300, keep: R16 } };
  const rows = [], MB = (x) => (x / 1048576).toFixed(1);
  for (const [name, M] of Object.entries(MODES).filter(([k]) => !process.env.ONLY || JSON.parse(process.env.ONLY).includes(k))) {
    await p.goto(srv.base + '/page.html?' + Math.random());   // a fresh page: a fresh module memory
    const r = await p.evaluate(async (M, reps) => {
      const U = make(45), V = make(12), med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
      TextColumns.idleTrim(M.trim, M.keep);
      const m0 = TextColumns._memBytes();
      let t = TextColumns.parse(U, M.o); const cnt = t.count; t = null;
      const m1 = TextColumns._memBytes(); await wait(600); const m2 = TextColumns._memBytes();
      const warm = [], cold = [], small = [];
      for (let i = 0; i < reps; i++) { let t0 = performance.now(); TextColumns.parse(U, M.o); warm.push(performance.now() - t0); }   // back to back: no idle time, nothing given back
      for (let i = 0; i < reps; i++) { await wait(600); const t0 = performance.now(); TextColumns.parse(U, M.o); cold.push(performance.now() - t0); }   // after an idle time (given back when trim is on)
      for (let i = 0; i < reps; i++) { await wait(600); const t0 = performance.now(); TextColumns.parse(V, M.o); small.push(performance.now() - t0); }
      TextColumns.warm(4); await TextColumns.parseParallel(U, Object.assign({ minBytes: 0 }, M.o)); const h1 = (await TextColumns._helperMem()).reduce((s, x) => s + x.bytes, 0);
      await wait(600); const h2 = (await TextColumns._helperMem()).reduce((s, x) => s + x.bytes, 0);
      const X = makeText(32), tx = [], st = [];   // a 32 MB text file read by the helpers after an idle time: total time and the page's longest stop
      for (let i = 0; i < reps; i++) {
        await wait(600); let last = performance.now(), worst = 0, on = true; const ch = new MessageChannel();
        ch.port1.onmessage = () => { const t = performance.now(); if (t - last > worst) worst = t - last; last = t; if (on) ch.port2.postMessage(0); }; ch.port2.postMessage(0);
        const t0 = performance.now(); await TextColumns.parseParallel(X, Object.assign({ minBytes: 0 }, M.o)); tx.push(performance.now() - t0); on = false; const t = performance.now(); if (t - last > worst) worst = t - last; st.push(worst); ch.port1.onmessage = null;
      }
      TextColumns.closeHelpers();
      return { cnt, m0, m1, m2, warm: med(warm), cold: med(cold), small: med(small), h1, h2, tx: med(tx), st: med(st), trims: TextColumns._trim.count };
    }, M, REPS);
    rows.push({ mode: name, after: MB(r.m1), idle: MB(r.m2), warm: r.warm.toFixed(0), cold: r.cold.toFixed(0), small: r.small.toFixed(0), h1: MB(r.h1), h2: MB(r.h2), tx: r.tx.toFixed(0), st: r.st.toFixed(0) });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'mode', title: 'mode', align: 'left' }, { key: 'after', title: 'page MB after 45 MB' }, { key: 'idle', title: 'after idle' }, { key: 'warm', title: '45 MB back to back ms' }, { key: 'cold', title: '45 MB after idle ms' }, { key: 'small', title: '12 MB after idle ms' }, { key: 'h1', title: 'helpers MB after' }, { key: 'h2', title: 'helpers after idle' }, { key: 'tx', title: 'text 32 MB after idle ms' }, { key: 'st', title: 'its longest stall ms' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows }));
  return true;
});
