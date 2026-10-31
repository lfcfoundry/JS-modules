#!/usr/bin/env node
// memory-compression 2.8.0 autoTries (on by default) against autoTries: false (the 2.7.0 way, same bytes as 2.7.0): pack time, bytes, and that both open to the same data.
// Lists from modules/memory-compression/test/data.js, mode 'balanced'. Run: node tests/memory-compression-auto-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 9), SETS (JSON [[set, rows], ...])
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const mod = path.resolve(__dirname, '..') + '/modules/memory-compression/', REPS = +(process.env.REPS || 9);
const SETS = process.env.SETS ? JSON.parse(process.env.SETS) : [['nfm-links', 60000], ['events', 40000], ['api-users', 20000], ['events', 100000], ['nfm-links', 150000], ['events', 300000], ['api-users', 150000]];
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/mc.js': fs.readFileSync(mod + 'memory-compression.js', 'utf8'), '/data.js': fs.readFileSync(mod + 'test/data.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/data.js"></script><script src="/mc.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const rows = [];
  for (const [set, n] of SETS) {
    const r = await p.evaluate(async (set, n, reps) => {
      const d = JsoData.sets[set](n), C = { 'autoTries (2.8.0 default)': { mode: 'balanced' }, 'autoTries: false (2.7.0)': { mode: 'balanced', autoTries: false } }, names = Object.keys(C), ms = {}, size = {};
      let same = true;
      for (const k of names) { const u = MemoryCompression.pack(d, C[k]); size[k] = u.length; if (JSON.stringify(MemoryCompression.unpack(u)) !== JSON.stringify(d)) same = false; ms[k] = []; }
      for (let i = 0; i < reps; i++) for (const k of (i % 2 ? names.slice().reverse() : names)) { await new Promise((ok) => setTimeout(ok, 0)); const t0 = performance.now(); window.sink = MemoryCompression.pack(d, C[k]); ms[k].push(performance.now() - t0); }
      const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      return names.map((k) => ({ set: set + ' ' + n, mode: k, ms: med(ms[k]), bytes: size[k], same }));
    }, set, n, REPS);
    const base = r[1];
    for (const x of r) rows.push({ set: x.set, mode: x.mode, ms: x.ms.toFixed(1), bytes: x.bytes, vs: (base.ms / x.ms).toFixed(2), grow: ((x.bytes / base.bytes - 1) * 100).toFixed(2) + '%', same: x.same ? 'yes' : 'NO' });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'set', title: 'list', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'ms', title: 'pack ms' }, { key: 'vs', title: 'x faster' }, { key: 'bytes', title: 'bytes' }, { key: 'grow', title: 'bigger' }, { key: 'same', title: 'opens the same' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows }));
  return rows.every((x) => x.same === 'yes');
});
