// Copyright (c) 2026 LFC Foundry. MIT License.
// packParallelStream (since 0.8.0): text pushed in pieces, blocks packed by helpers while it arrives, the file is the one pack() writes.
const JF = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
(async () => {
  await JF.init();
  const cases = [['logs, 16 KB pieces', gen.logs(30000), 300000, 16384, {}], ['events, 997-byte pieces, meta', gen.events(2000), 40000, 997, { meta: { a: 1 } }],
    ['no final newline', gen.logs(3000).replace(/\n$/, ''), 40000, 50000, {}], ['one block', gen.logs(100), 21 << 20, 1000, {}], ['empty', '', 1000, 10, {}],
    ['whole text in one push', gen.logs(20000), 100000, 1 << 30, {}], ['1-byte pieces at the start, then big', gen.events(1500), 30000, 3, {}], ['random access, no share', gen.events(6000), 0, 8192, { access: 'random', share: false }]];
  for (const [name, text, bb0, piece, extra] of cases) {
    const b = Buffer.from(text), o = Object.assign({}, extra, bb0 ? { blockBytes: bb0 } : {}), want = JF.pack(b, o), s = JF.packParallelStream(Object.assign({ workers: 3 }, o));
    const lim = name.startsWith('1-byte') ? 4000 : b.length;   // 3-byte pieces for the first 4000 bytes only, then one big piece
    let p = 0; for (; p < Math.min(lim, b.length); p += piece) s.push(b.subarray(p, Math.min(b.length, p + piece)));
    if (p < b.length) s.push(b.subarray(p));
    const got = await s.finish();
    assert.ok(same(got, want), name + ': bytes differ from pack');
    console.log(name, 'same bytes as pack, ok');
  }
  { // the caller may reuse its buffer after push
    const b = Buffer.from(gen.logs(8000)), o = { blockBytes: 50000 }, want = JF.pack(b, o), s = JF.packParallelStream(Object.assign({ workers: 2 }, o)), tmp = Buffer.alloc(7000);
    for (let p = 0; p < b.length; p += 7000) { const n = Math.min(7000, b.length - p); b.copy(tmp, 0, p, p + n); s.push(tmp.subarray(0, n)); tmp.fill(0x78); }
    assert.ok(same(await s.finish(), want), 'buffer reuse: bytes differ'); console.log('caller reuses its buffer after push, ok');
  }
  { // two streams at once, and a packParallel in between
    const a = Buffer.from(gen.logs(15000)), c = Buffer.from(gen.events(4000)), o = { blockBytes: 60000 }, s1 = JF.packParallelStream({ workers: 2, blockBytes: 60000 }), s2 = JF.packParallelStream({ workers: 2, blockBytes: 60000 });
    for (let p = 0; p < Math.max(a.length, c.length); p += 20000) { if (p < a.length) s1.push(a.subarray(p, p + 20000)); if (p < c.length) s2.push(c.subarray(p, p + 20000)); }
    const mid = JF.packParallel(c, { workers: 2, blockBytes: 60000 });
    const [r1, r2, r3] = await Promise.all([s1.finish(), s2.finish(), mid]);
    assert.ok(same(r1, JF.pack(a, o)) && same(r2, JF.pack(c, o)) && same(r3, JF.pack(c, o)), 'overlapping streams: bytes differ'); console.log('two streams and a packParallel at once, ok');
  }
  assert.throws(() => JF.packParallelStream({ share: true }), /share/); assert.throws(() => JF.packParallelStream({ exact: true }), /exact/);
  { const s = JF.packParallelStream({ workers: 2 }); s.push(Buffer.from('{"a":1}\n')); await s.finish(); assert.throws(() => s.push(Buffer.from('x')), /finished/); assert.throws(() => s.finish(), /finished/); }
  console.log('packParallelStream refusals and finished stream, ok');
  { // onPart: blocks come out in file order while packing; parts + the returned footer are the file pack() writes
    for (const [text, bb0, piece, w] of [[gen.logs(30000), 200000, 16384, 3], [gen.events(3000), 30000, 997, 2], [gen.logs(100), 21 << 20, 1000, 2], ['', 1000, 10, 2]]) {
      const b = Buffer.from(text), o = { blockBytes: bb0 }, want = JF.pack(b, o), parts = [];
      const s = JF.packParallelStream({ workers: w, blockBytes: bb0, onPart: (u) => { parts.push(Buffer.from(u)); } });
      for (let p = 0; p < b.length; p += piece) s.push(b.subarray(p, Math.min(b.length, p + piece)));
      const foot = await s.finish(); parts.push(Buffer.from(foot));
      assert.ok(same(Buffer.concat(parts), want), 'onPart: parts + footer differ from pack'); if (b.length > bb0) assert.ok(parts.length > 2, 'onPart: blocks were not handed out before finish');
    }
    console.log('onPart: parts + footer are the pack() bytes, ok');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
