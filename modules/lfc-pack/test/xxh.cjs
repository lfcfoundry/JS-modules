// check:'xxh64' writes a 7th block-table item that readers verify; plain files and damaged files behave. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const L = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await L.init(); const rows = []; for (let i = 0; i < 30000; i++) rows.push(JSON.stringify({ i, s: 'v' + (i % 77), t: i * 0.5 }));
  const text = rows.join('\n') + '\n', a = L.pack(text, { blockBytes: 200000, check: 'xxh64' }), p = L.pack(text, { blockBytes: 200000 });
  assert(L.unpack(a).length === 30000 && L.unpack(p).length === 30000);
  const f = L.info(a); assert(f.blocks > 1);
  assert(a.length > p.length && a.length - p.length < 40 * f.blocks + 64, 'size ' + (a.length - p.length));
  const par = await L.packParallel(text, { blockBytes: 200000, check: 'xxh64' }); assert(L.unpack(par).length === 30000);
  // damage a body byte: both kinds of file refuse it
  for (const file of [a, p]) { const d = file.slice(); d[1000] ^= 1; assert.throws(() => L.unpack(d), /checksum|damaged/); }
  console.log('ok   xxh64 block checks');
})().catch((e) => { console.error(e); process.exit(1); });
