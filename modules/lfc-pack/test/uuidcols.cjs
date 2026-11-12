// Copyright (c) 2026 LFC Foundry. MIT License.
// Since 0.9.2: UUID columns of the fast flat writer are converted to bytes in wasm straight from the input, with no strings made. Rows must come back exact for good and bad UUID columns (upper case, wrong dashes, wrong lengths, 36-character hex, nulls, late bad value), and the file stays smaller than plain zstd.
const JF = require('../lfc-pack.js'), assert = require('assert'), zlib = require('zlib');
let s = 17; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const hx = (n) => { let o = ''; for (let i = 0; i < n; i++) o += '0123456789abcdef'[(r() * 16) | 0]; return o; };
const uuid = () => hx(8) + '-' + hx(4) + '-' + hx(4) + '-' + hx(4) + '-' + hx(12);
const kinds = {
  good: () => uuid(),
  edges: (i) => ['00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', uuid()][i % 3],
  upperLate: (i, n) => i === n - 3 ? uuid().toUpperCase() : uuid(),
  badDashLate: (i, n) => i === n - 2 ? hx(8) + '_' + hx(4) + '-' + hx(4) + '-' + hx(4) + '-' + hx(12) : uuid(),
  badHexLate: (i, n) => i === n - 1 ? uuid().slice(0, 35) + 'g' : uuid(),
  shortLate: (i, n) => i === n - 1 ? uuid().slice(0, 30) : uuid(),
  hex36: () => hx(36),
  hex32: () => hx(32),
  nullLate: (i, n) => i > n - 4 ? null : uuid(),
  nullFirst: (i) => i === 0 ? null : uuid(),
  mixedText: (i) => i % 5 === 0 ? 'n/a' : uuid(),
  dashAt8Only: (i) => hx(8) + '-' + hx(27)
};
(async () => {
  await JF.init();
  for (const k of Object.keys(kinds)) for (const n of [40, 3000, 60000]) {
    const lines = []; for (let i = 0; i < n; i++) lines.push(JSON.stringify({ id: i, u: kinds[k](i, n), v: uuid(), t: 1760000000 + i }));
    const text = lines.join('\n'), want = lines.map((l) => JSON.parse(l)), p = JF.pack(text), back = JF.unpack(p);
    assert.deepStrictEqual(back, want, k + ' ' + n);
    if (zlib.zstdCompressSync && n >= 3000) assert.ok(p.length <= zlib.zstdCompressSync(Buffer.from(text)).length, k + ' ' + n + ': not larger than plain zstd');
  }
  console.log('ok uuid columns');
})().catch((e) => { console.error(e); process.exit(1); });
