#!/usr/bin/env node
// text-columns 0.6.2 helper idle close (helpers close 5 s after the last call) against keeping them (0.6.1, _helperIdle(-1)): parseParallel after a 6 s pause, default options.
// Run: node tests/text-columns-idle-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 5)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 5);
const MAKE = `window.make = function (mb, text) { var s = 7, rnd = function () { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }, W = ['alpha', 'beta', 'gamma', 'delta', 'north'], parts = [text ? 'id,name,score\\n' : 'a,b,c,d\\n'], n = 0, i, L;
  while (n < mb * 1e6) { L = []; for (i = 0; i < 2000; i++) L.push(text ? [(rnd() * 1e6 | 0), W[rnd() * 5 | 0] + (rnd() * 1e4 | 0), (rnd() * 100).toFixed(2)].join(',') : [(rnd() * 1e6 | 0), (rnd() * 1000).toFixed(3), (rnd() * 9 | 0), (rnd() * 77).toFixed(2)].join(',')); L = L.join('\\n') + '\\n'; parts.push(L); n += L.length; }
  return new TextEncoder().encode(parts.join('')); };`;
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/tc.js': fs.readFileSync(root + 'text-columns/text-columns.js', 'utf8'), '/make.js': MAKE, '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/tc.js"></script><script src="/make.js"></script>' });
  const rows = [], MODES = { 'keep helpers (0.6.1)': -1, 'close after 5 s (0.6.2)': 5000 };
  for (const [name, ms] of Object.entries(MODES)) {
    const p = await b.newPage(); await p.goto(srv.base + '/page.html?' + Math.random());
    const r = await p.evaluate(async (ms, reps) => {
      TextColumns._helperIdle(ms);
      const files = { 'numbers 45 MB': make(45), 'text 32 MB': make(32, 1), 'numbers 12 MB': make(12) }, out = {}, wait = (t) => new Promise((ok) => setTimeout(ok, t)), med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      TextColumns.warm(); await TextColumns.parseParallel(files['numbers 12 MB']);
      for (const k of Object.keys(files)) { out[k] = []; for (let i = 0; i < reps; i++) { await wait(6000); const t0 = performance.now(); await TextColumns.parseParallel(files[k]); out[k].push(performance.now() - t0); } }
      await wait(6000); const alive = TextColumns._helperMem ? (await TextColumns._helperMem()).length : -1;
      const res = {}; for (const k of Object.keys(out)) res[k] = med(out[k]); res.alive = alive; return res;
    }, ms, REPS);
    for (const k of Object.keys(r)) if (k !== 'alive') rows.push({ mode: name, file: k, ms: r[k].toFixed(1) });
    rows.push({ mode: name, file: 'helpers alive 6 s after', ms: String(r.alive) });
    await p.close();
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'mode', title: 'mode', align: 'left' }, { key: 'file', title: 'parseParallel after a 6 s pause', align: 'left' }, { key: 'ms', title: 'ms' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows }));
  return true;
});
