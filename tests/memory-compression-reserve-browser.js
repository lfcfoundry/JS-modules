#!/usr/bin/env node
// memory-compression 2.8.1 reserve (after the 2 s idle trim, small fresh helpers are made at once) against 2.8.0 (made on the next call): the first pack after an idle time.
// Run: node tests/memory-compression-reserve-browser.js <chromium|firefox|webkit> [out.json] [old build]     Env: REPS (default 7). The old build defaults to git main's file.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), T = require('../tools/test-runner/runner.js');
const mod = path.resolve(__dirname, '..') + '/modules/memory-compression/', REPS = +(process.env.REPS || 7);
const OLD = process.argv[4] ? fs.readFileSync(process.argv[4], 'utf8') : cp.execSync('git show origin/main:modules/memory-compression/memory-compression.js', { cwd: mod, maxBuffer: 1 << 26 }).toString();
T.main(async (b, which, outFile) => {
  const page = (src) => '<!doctype html><meta charset=utf-8><title>t</title><script src="/data.js"></script><script src="' + src + '"></script>';
  const srv = await T.serve({ '/new.js': fs.readFileSync(mod + 'memory-compression.js', 'utf8'), '/old.js': OLD, '/data.js': fs.readFileSync(mod + 'test/data.js', 'utf8'), '/new.html': page('/new.js'), '/old.html': page('/old.js') });
  const res = { old: [], new: [], warm: [] }, pages = {};
  for (const k of ['old', 'new']) { pages[k] = await b.newPage(); await pages[k].goto(srv.base + '/' + k + '.html'); }
  for (let i = 0; i < REPS; i++) for (const k of (i % 2 ? ['new', 'old'] : ['old', 'new'])) {
    const r = await pages[k].evaluate(async () => {
      const d = window.D || (window.D = JsoData.sets.events(40000)), wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
      MemoryCompression.pack(d, { mode: 'balanced' }); let t0 = performance.now(); MemoryCompression.pack(d, { mode: 'balanced' }); const warm = performance.now() - t0;
      await wait(2600); t0 = performance.now(); const u = MemoryCompression.pack(d, { mode: 'balanced' }); const cold = performance.now() - t0;
      return { warm, cold, same: JSON.stringify(MemoryCompression.unpack(u)) === JSON.stringify(d) };
    });
    if (!r.same) throw new Error('different data from ' + k);
    res[k].push(r.cold); if (k === 'new') res.warm.push(r.warm);
  }
  srv.close();
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const rows = [{ mode: '2.8.0 first pack after idle', ms: med(res.old).toFixed(1) }, { mode: '2.8.1 first pack after idle (reserve)', ms: med(res.new).toFixed(1) }, { mode: 'warm pack (no idle)', ms: med(res.warm).toFixed(1) }];
  console.log(T.table(rows, [{ key: 'mode', title: 'events 40,000, balanced', align: 'left' }, { key: 'ms', title: 'pack ms' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows }));
  return true;
});
