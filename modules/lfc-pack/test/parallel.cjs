// Copyright (c) 2026 LFC Foundry. MIT License.
// Block-parallel pack writes the same bytes as the single-thread pack (Node worker_threads here; the browser check uses real Web Workers).
const JF = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
(async () => {
  await JF.init();
  for (const [f, text, bb] of [['made-up logs', gen.logs(30000), 300000], ['made-up events', gen.events(8000), 200000]]) {
    const b = Buffer.from(text), want = JF.pack(b, { blockBytes: bb });
    for (const w of [2, 3, 8]) assert.ok(Buffer.from(await JF.packParallel(b, { blockBytes: bb, workers: w })).equals(Buffer.from(want)), f + ' x' + w + ': bytes differ');
    console.log(f, 'blocks', JF.info(want).blocks, 'same bytes with 2, 3 and 8 helpers, ok');
  }
  { const b = Buffer.from(gen.logs(30000)), m = { title: 'p', n: [1, 2] }, want = JF.pack(b, { blockBytes: 300000, meta: m }); assert.ok(Buffer.from(await JF.packParallel(b, { blockBytes: 300000, workers: 3, meta: m })).equals(Buffer.from(want)), 'meta: bytes differ'); assert.deepStrictEqual(JF.metadata(want), { v: 1, title: 'p', n: [1, 2] }); console.log('metadata in block-parallel pack, same bytes, ok'); }
  const nt = Buffer.from(gen.logs(2000).replace(/\n$/, '')), a = JF.pack(nt, { blockBytes: 40000 });
  assert.ok(Buffer.from(await JF.packParallel(nt, { blockBytes: 40000, workers: 4 })).equals(Buffer.from(a)), 'no trailing newline');
  const ex = Buffer.from(gen.logs(3000)); assert.ok(Buffer.from(await JF.packParallel(ex, { exact: true, blockBytes: 50000 })).equals(Buffer.from(JF.pack(ex, { exact: true, blockBytes: 50000 }))), 'exact stays single thread');
  let err = null; try { await JF.packParallel(Buffer.from('{"a":1}\nnotjson\n'.repeat(20000)), { blockBytes: 100000, workers: 3 }); } catch (e) { err = e; } assert.ok(err, 'a bad row is refused');
  assert.strictEqual((await JF.packParallel(Buffer.from(''), {})).length, JF.pack(Buffer.from('')).length);
})().catch((e) => { console.error(e); process.exit(1); });
