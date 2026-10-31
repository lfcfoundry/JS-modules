// Copyright (c) 2026 LFC Foundry. MIT License.
// Overlapping calls never share a helper or close one mid-job: warmPack while packParallel runs, two packParallel calls at once, and a call right after warmPack.
const L = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
const guard = (p, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(what + ' never finished')), 20000).unref())]);
(async () => {
  await L.init();
  const b = Buffer.from(gen.logs(60000)), o = { blockBytes: 200000, workers: 2 }, want = L.pack(b, { blockBytes: 200000 });
  const same = (x, what) => assert.ok(Buffer.compare(Buffer.from(x), Buffer.from(want)) === 0, what + ': bytes differ from pack()');
  same(await guard(L.packParallel(b, o), 'first call'), 'first call');                 // 2 helpers now idle
  assert.strictEqual(await guard(L.warmPack(4), 'warmPack'), 4, 'warmPack(4) with 2 idle helpers keeps 4 (0.4.6 kept 2: it took the idle ones as if new)');
  const big = Buffer.from(gen.logs(400000)), wantBig = L.pack(big, { blockBytes: 200000 });
  const w = L.warmPack(4), p1 = L.packParallel(big, o);                                  // warm adds 2 while a longer call takes the idle 2 and finishes after warm
  const n = await guard(w, 'warmPack'), p2 = L.packParallel(b, o);                       // a call right after warmPack, while the long call still runs
  same(await guard(p2, 'call after warmPack'), 'call after warmPack'); assert.ok(Buffer.compare(Buffer.from(await guard(p1, 'call during warmPack')), Buffer.from(wantBig)) === 0, 'call during warmPack: bytes differ');
  const r = await guard(Promise.all([L.packParallel(b, o), L.packParallel(b, o), L.packParallel(b, o)]), 'three calls at once');
  r.forEach((x, i) => same(x, 'overlapping call ' + i));
  assert.ok(n >= 2, 'warmPack count');
  console.log('ok   overlapping packParallel and warmPack calls: no shared or closed helpers, same bytes'); process.exit(0);
})().catch((e) => { console.log('FAIL', e && e.message || e); process.exit(1); });
