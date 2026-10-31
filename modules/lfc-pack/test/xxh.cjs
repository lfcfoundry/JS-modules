// check:'xxh64' writes a 7th block-table item that readers verify; plain files and damaged files behave. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const L = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await L.init(); const rows = []; for (let i = 0; i < 30000; i++) rows.push(JSON.stringify({ i, s: 'v' + (i % 77), t: i * 0.5 }));
  const text = rows.join('\n') + '\n', a = L.pack(text, { blockBytes: 200000, check: 'xxh64' }), p = L.pack(text, { blockBytes: 200000 });
  assert(L.unpack(a).length === 30000 && L.unpack(p).length === 30000);
  const f = L.info(a); assert(f.blocks > 1);
  assert(a.length > p.length && a.length - p.length < 200 * f.blocks + 64, 'size ' + (a.length - p.length));
  const par = await L.packParallel(text, { blockBytes: 200000, check: 'xxh64' }); assert(L.unpack(par).length === 30000);
  // damage a body byte: both kinds of file refuse it
  for (const file of [a, p]) { const d = file.slice(); d[1000] ^= 1; assert.throws(() => L.unpack(d), /checksum|damaged/); }
  // column checks: a one-column read checks the prefix and its own column only
  const fl = L.pack(text, { blockBytes: 200000, check: 'xxh64', block: 'flat' }), one = L.unpack(fl, { keys: ['i'] }); assert(one.length === 30000 && one[5].i === 5 && Object.keys(one[5]).length === 1);
  const one1 = L.pack(text, { check: 'xxh64', block: 'flat' }), dv = new DataView(one1.buffer, one1.byteOffset), end = one1.length - 16 - dv.getUint32(one1.length - 16, true);
  const bad = one1.slice(); bad[end - 3] ^= 1;   // last bytes of the body: the last column's frame
  assert.throws(() => L.unpack(bad), /checksum|damaged/); assert.throws(() => L.unpack(bad, { keys: ['t'] }), /checksum|damaged/);
  assert(L.unpack(bad, { keys: ['i'] }).length === 30000, 'a column that is not damaged still reads');
  console.log('ok   xxh64 block checks');
})().catch((e) => { console.error(e); process.exit(1); });
