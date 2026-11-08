// Copyright (c) 2026 LFC Foundry. MIT License.
// unpack(bytes, { keys }) on nested blocks builds only the wanted keys (since 0.8.1): the rows must be exactly what the full unpack gives with only those keys kept (same values; key order is not compared, flat blocks give column order). The fuzz against the 0.8.0 file (identical JSON text, order included) was run by hand.
const JF = require('../lfc-pack.js'), assert = require('assert');
let s = 11; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, pick = (a) => a[(r() * a.length) | 0];
const names = ['id', 'name', 'pos', 'tags', 'ok', 'extra', '1', '2', 'ts', 'a b', 'é'];
function val(d) { const t = (r() * (d > 1 ? 6 : 9)) | 0; return t === 0 ? (r() * 1000 | 0) : t === 1 ? 's' + (r() * 50 | 0) : t === 2 ? r() < .5 : t === 3 ? null : t === 4 ? (r() * 1000) / 7 : t === 5 ? 'x' : t === 6 ? { x: r() * 9 | 0, y: 'q' + (r() * 5 | 0), z: [1, 2, 'k'] } : t === 7 ? Array.from({ length: (r() * 4 | 0) }, () => val(d + 1)) : { n: { m: val(d + 1) } }; }
const keep = (rows, keys) => { const want = {}; for (const k of keys) want[k] = 1; return rows.map((row) => { const o = {}; for (const k in want) if (Object.prototype.hasOwnProperty.call(row, k)) o[k] = row[k]; return o; }); };   // the order the keys option has always given: own keys of a table of the wanted names
(async () => {
  await JF.init(); let cases = 0;
  for (let round = 0; round < 24; round++) {
    const shapes = Array.from({ length: 1 + (round % 3 === 0 ? 30 : 3) }, () => { const ks = names.filter(() => r() < .5); if (!ks.length) ks.push('id'); return ks; });
    const n = 300 + (r() * 3000 | 0), rows = [];
    for (let i = 0; i < n; i++) { const o = {}; for (const k of pick(shapes)) o[k] = k === 'ts' ? 1000 + i : val(0); rows.push(o); }
    const bytes = JF.packRows(rows, round % 2 ? { blockBytes: 20000 } : {}), full = JF.unpack(bytes);
    for (let q = 0; q < 6; q++) {
      const keys = names.filter(() => r() < .3); if (!keys.length) keys.push(pick(names));
      assert.deepStrictEqual(JF.unpack(bytes, { keys }), keep(full, keys), 'round ' + round + ' keys ' + keys.join(','));
      if (q === 3) { const range = { key: 'ts', min: 1000 + (n >> 2), max: 1000 + (n >> 1) }, got = JF.unpack(bytes, { keys, range }), all = JF.unpack(bytes, { range }); assert.deepStrictEqual(got, keep(all, keys), 'range round ' + round); }
      cases++;
    }
  }
  console.log('nested keys: ' + cases + ' key sets give the full rows with only those keys, ok');
})().catch((e) => { console.error(e); process.exit(1); });
