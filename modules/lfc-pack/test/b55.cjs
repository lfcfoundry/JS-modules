// B55 (0.10.31): row saves (packRows over 4,096 rows, packRowsParallel) get per-column checks, as text saves do since B44: damage in one column makes reads of that column throw and leaves reads of other columns right. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const assert = require('assert');
const path = require('path');
(async () => {
  const L = require(path.join(__dirname, '..', 'lfc-pack.js'));
  await L.init();
  const rows = []; for (let i = 0; i < 20000; i++) rows.push({ a: (i * 37) % 1000 / 4, b: i % 13 ? (i * 7919) % 5000 : null, c: 'n' + (i % 50) });
  const f = L.packRows(rows);
  const good = { a: L.aggregate(f, { key: 'a' }), b: L.aggregate(f, { key: 'b' }) };
  let threwA = 0, threwB = 0, onlyOne = 0, checks = 0;
  for (let k = 0; k < 80; k++) {
    const d = f.slice(), at = 64 + Math.floor((d.length - 400) * k / 80);
    d[at] ^= 0x5a;
    const r = {};
    for (const key of ['a', 'b']) { try { r[key] = L.aggregate(d, { key }); } catch (e) { r[key] = 'threw'; } }
    for (const key of ['a', 'b']) if (r[key] !== 'threw') { assert.deepStrictEqual(r[key], good[key], 'flip at ' + at + ' gave a wrong ' + key + ' sum'); checks++; }
    if (r.a === 'threw') threwA++; if (r.b === 'threw') threwB++;
    if ((r.a === 'threw') !== (r.b === 'threw')) onlyOne++;
  }
  assert(threwA > 0 && threwB > 0, 'damage is caught: ' + threwA + ' / ' + threwB);
  assert(onlyOne > 0, 'some flips break only one column (per-column checks), got ' + onlyOne);
  console.log('b55: 80 flips, no wrong sums, ' + onlyOne + ' flips broke only one column (' + checks + ' right answers)');
})().catch(e => { console.error(e); process.exit(1); });
