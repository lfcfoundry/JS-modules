// Copyright (c) 2026 LFC Foundry. MIT License.
// open().readAhead(): reads the next block when idle; rows unchanged; nothing on a one-block or raw file; two calls read two blocks; waits for a read in progress; works without requestIdleCallback (Node). Pass/fail only. Run: node modules/lfc-pack/test/readahead.cjs
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rows = Array.from({ length: 20000 }, (_, i) => ({ id: i, name: 'n' + (i % 97), v: i * 0.5 }));
  const text = Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const f = J.pack(text, { blockBytes: 65536 });
  let reads = []; const fn = (o, len) => { reads.push(o); return f.subarray(o, o + len); }; fn.size = f.length;
  const R = await J.open(fn); ok(R.blocks.length > 3, 'several blocks');
  const first = await R.rows({ from: 0, count: 10 }); reads = [];
  ok(await R.readAhead() === true && reads.length === 1 && reads[0] === R.blocks[1].offset, 'reads block 1 after a first screen');
  ok(await R.readAhead() === true && reads.length === 2 && reads[1] === R.blocks[2].offset, 'a second call reads the next block');
  ok(same(first, rows.slice(0, 10)) && same(await R.rows({ from: 500, count: 20 }), rows.slice(500, 520)), 'rows unchanged');
  const R2 = await J.open(fn); reads = []; const p = R2.rows({ from: 0, count: 3 }), a = R2.readAhead(); ok(await a === true && same(await p, rows.slice(0, 3)), 'waits for a read in progress');
  const one = await J.open(J.pack(Buffer.from('{"a":1}\n{"a":2}\n'))); ok(await one.readAhead() === true && await one.readAhead() === false, 'one-block file: read once, then nothing');
  const ex = await J.open(J.pack(Buffer.from(rows.slice(0, 6000).map((r) => '{ "id" : ' + r.id + ' ,  "name": "' + r.name + '" }').join('\r\n') + '\r\n'), { exact: true, blockBytes: 32768 })); ok(await ex.readAhead() === false, 'raw (exact) file: nothing');
  const all = await J.open(f); for (let i = 0; i < all.blocks.length; i++) await all.readAhead(); ok(await all.readAhead() === false, 'false when every block was read');
  console.log(bad ? 'readahead: ' + bad + ' bad of ' + n : 'readahead ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
