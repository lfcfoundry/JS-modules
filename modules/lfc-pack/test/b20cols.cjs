// Copyright (c) 2026 LFC Foundry. MIT License.
// B20 column reads: all-null and hand-read JSON cells, and the one-pass zigzag decode (blocks of 16,384+ values) give the same values as the rows that were packed.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const L = require('../lfc-pack.js');
(async () => {
  await L.init();
  // jcell against JSON.parse on edge texts
  const m = fs.readFileSync(path.join(__dirname, '..', 'src', 'flat.js'), 'latin1').match(/function jcell\(s\) \{[\s\S]*?return JSON.parse\(s\); \}/);
  assert(m, 'jcell found'); const jcell = eval('(' + m[0] + ')');
  const T = ['null', 'true', 'false', '0', '-0', '1', '-1', '01', '-01', '-', '00', '123456789012345', '1234567890123456', '9007199254740993', '-123456789012345', '1.5', '1e3', '"x"', '[1]', '{}', 'nul', 'truee', '0x1', ' 1', '1 ', '-a', '12a', '', '1E2', '-0.0'];
  for (const s of T) { let a, b, ea, eb; try { a = JSON.parse(s); } catch (e) { ea = 1; } try { b = jcell(s); } catch (e) { eb = 1; } assert(ea === eb && (ea || Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)), 'jcell ' + JSON.stringify(s)); }
  let s = 5; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 20000; k++) { const x = Math.floor((r() * 2 - 1) * 10 ** Math.floor(r() * 16)), t = JSON.stringify(x); assert(Object.is(jcell(t), JSON.parse(t)), 'jcell ' + t); }
  // columns of the same table at several sizes (zigzag: 16,384 is the one-pass threshold)
  for (const N of [3000, 16383, 16384, 30000]) {
    const rows = [];
    for (let i = 0; i < N; i++) rows.push({
      zz: Math.floor((r() * 2 - 1) * 10 ** (1 + Math.floor(r() * 9))),
      big: Math.floor((r() * 2 - 1) * 1e14),
      money: Math.round(r() * 100000) / 100,
      jn: null,
      jm: [null, true, false, 7, -12, 123456789012345, 'x', 1.5, 0.25][i % 9]
    });
    const bytes = L.packRows(rows);
    assert.deepStrictEqual(L.unpack(bytes), rows, 'rows ' + N);
    const blocks = L.unpackColumns(bytes);
    for (const k of Object.keys(rows[0])) {
      let at = 0;
      for (const b of blocks) { const c = b.cols[k]; for (let j = 0; j < c.length; j++, at++) assert(Object.is(c[j], rows[at][k]) || JSON.stringify(c[j]) === JSON.stringify(rows[at][k]), 'column ' + k + ' row ' + at + ' of ' + N); }
      assert.strictEqual(at, N, 'count ' + k);
    }
  }
  console.log('b20 columns: jcell, all-null frames, one-pass zigzag at 4 sizes ok');
})().catch((e) => { console.error(e); process.exit(1); });
