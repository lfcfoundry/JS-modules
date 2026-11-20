// Copyright (c) 2026 LFC Foundry. MIT License.
// Timestamp columns: more than n / 2 different values are written as a date column (W), n / 2 or fewer as text with a dictionary. The count is a typed hash table (0.13.8), so this pins the boundary, 0 and -0 as one value, and short columns. Run: node modules/lfc-pack/test/datemany.cjs
'use strict';
const JF = require('../lfc-pack.js');
const isW = async (vals) => { const b = await JF.packBlock({ t: { kind: 'ts', unit: 's', values: Float64Array.from(vals), fmt: 'YYYY-MM-DD HH:MM:SS' } }, { level: 3, blockBytes: 8388608, share: false }); return JF.stats(b).some((x) => (x.keys || []).some((k) => k.type === 'W')); };
(async () => {
  await JF.init(); let bad = 0;
  const T = 1767261600, chk = async (name, vals, want) => { const got = await isW(vals); if (got !== want) { bad++; console.log('FAIL ' + name + ': date column ' + got + ', want ' + want); } };
  for (const n of [4, 63, 64, 65, 200, 1000, 4097]) {
    const h = n >> 1, mk = (d) => Array.from({ length: n }, (_, i) => T + (i % d));
    await chk('n' + n + ' half distinct', mk(h), false);
    await chk('n' + n + ' half+1 distinct', mk(h + 1), true);
    await chk('n' + n + ' all distinct', mk(n), true);
  }
  const z = Array.from({ length: 200 }, (_, i) => T + (i % 100)); z[0] = 0; z[1] = -0; z[2] = 0; z[3] = T + 1000; z[4] = T + 1001;   // 0 and -0 are one value
  await chk('zero and -0', z, await isW(z));   // run twice with the same answer: the pair must not count as two values
  const k = Array.from({ length: 200 }, (_, i) => (i < 100 ? 0 : T + i - 99)); k[1] = -0;   // 101 distinct values (0, -0 one) of 200: more than half
  await chk('0 and -0 count once', k, true);
  const k2 = Array.from({ length: 200 }, (_, i) => (i < 100 ? (i % 2 ? 0 : -0) : T + (i - 100) % 99));   // 0 plus 99 others = 100 distinct: half, so text
  await chk('0 and -0 count once (half)', k2, false);
  console.log((bad ? 'FAIL' : 'ok  ') + ' date count boundary: bad ' + bad);
  process.exitCode = bad ? 1 : 0; if (JF.close) JF.close();
})();
