// Copyright (c) 2026 LFC Foundry. MIT License.
// B22: a save of more than 4 MiB of row text with big blocks cuts its first block at the first line end at or after 64 KiB (every writer); smaller saves are unchanged; rows are identical. Pass/fail only. Run: node modules/lfc-pack/test/headblock.cjs
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const mk = (k) => Buffer.from(Array.from({ length: k }, (_, i) => JSON.stringify({ id: i, name: 'n' + (i % 977), v: i * 0.5, t: 'x'.repeat(i % 40) })).join('\n') + '\n');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const blocks = async (f) => (await J.open(f)).blocks.map((b) => b.rows);
  const big = mk(75000), small = mk(30000);   // about 5.6 MB and 2.2 MB
  ok(big.length > (4 << 20) && small.length < (4 << 20), 'fixture sizes ' + big.length + ' ' + small.length);
  const want = J.unpackRows(J.pack(big, { blockBytes: 1 << 30 }));
  const writers = {
    pack: () => J.pack(big),
    packRows: () => J.packRows(want),
    packParallel: async () => J.packParallel(big, { workers: 2 }),
    packStream: () => { const s = J.packStream(); const out = []; for (let o = 0; o < big.length; o += 100000) out.push(...s.push(big.subarray(o, o + 100000))); out.push(...s.finish()); return Buffer.concat(out.map((x) => Buffer.from(x))); }
  };
  const ref = J.pack(big);
  for (const [name, w] of Object.entries(writers)) {
    const f = await w(), b = await blocks(f);
    ok(b.length === 2 && b[0] > 0 && b[0] < 1500, name + ' head block small: ' + b.join(','));
    ok(same(J.unpackRows(f), want), name + ' rows identical');
    if (name !== 'packRows') ok(eq(f, ref), name + ' same bytes as pack');
  }
  ok((await blocks(J.pack(small))).length === 1, 'under 4 MiB: one block');
  ok((await blocks(J.pack(big, { blockBytes: 1 << 20 }))).length > 2 && (await blocks(J.pack(big, { blockBytes: 1 << 20 })))[0] > 1500, 'explicit small blockBytes: no head block');
  const e = await J.open(ref); ok(same(await e.rows({ from: 100, count: 5000 }), want.slice(100, 5100)), 'range across the head block');
  const q = J.unpack(ref, { equals: { key: 'name', value: 'n5' } }); ok(same(q, want.filter((r) => r.name === 'n5')), 'equality across the head block');
  console.log(bad ? 'headblock: ' + bad + ' bad of ' + n : 'headblock ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
