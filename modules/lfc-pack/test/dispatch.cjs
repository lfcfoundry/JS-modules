// packParallel hands out one block at a time (same bytes as the fixed split and as pack), warmPack starts helpers, balance:'even' packs readable files. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const L = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await L.init(); const rows = []; for (let i = 0; i < 40000; i++) rows.push(JSON.stringify({ i, s: 'v' + (i % 77), t: i * 0.5, o: { k: i % 9 } }));
  const text = rows.join('\n') + '\n', same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const one = L.pack(text, { blockBytes: 300000 });
  const dyn = await L.packParallel(text, { workers: 3, blockBytes: 300000 }), fixed = await L.packParallel(text, { workers: 3, blockBytes: 300000, dynamic: false });
  assert(same(one, dyn), 'dynamic dispatch gives the bytes pack gives'); assert(same(one, fixed), 'fixed split gives the bytes pack gives');
  assert(await L.warmPack(2) >= 2, 'warmPack starts helpers');
  const ev = await L.packParallel(text, { workers: 3, balance: 'even' }); assert(L.unpack(ev).length === 40000, 'even balance file reads back');
  console.log('ok   packParallel dispatch: dynamic and fixed give the bytes pack gives; warmPack; balance even'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
