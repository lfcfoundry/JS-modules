// Copyright (c) 2026 LFC Foundry. MIT License.
// Since 0.9.1: a key whose values are of more than one JSON kind (numbers with null, numbers with text, booleans, escapes) stays on the fast flat writer: rows must come back exact, including -0, and the file stays smaller than plain zstd.
const JF = require('../lfc-pack.js'), assert = require('assert'), zlib = require('zlib');
let s = 21; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const pools = {
  nullnum: () => r() < 0.05 ? null : Math.round(r() * 1e5) / 1e3,
  nullstr: () => r() < 0.05 ? null : 'name ' + ((r() * 50) | 0),
  strnum: () => r() < 0.5 ? 'v' + ((r() * 9) | 0) : (r() * 100) | 0,
  escuni: () => [null, 'café "q"\n', '日本', 'x\\y', 12, true, 'tab\there', '😀 ok'][(r() * 8) | 0],
  boolnum: () => r() < 0.5 ? r() < 0.5 : (r() * 3) | 0,
  longmix: () => [r(), null, -0, 1e300, 'n/a', 7][(r() * 6) | 0]
};
(async () => {
await JF.init();
for (const k of Object.keys(pools)) for (const n of [50, 3000, 70000]) {
  const lines = []; for (let i = 0; i < n; i++) { const x = { id: i, t: 1760000000 + i, w: i === 0 ? null : Math.round(r() * 1e4) / 100 }; if (i % 11 !== 3) x.v = pools[k](); lines.push(JSON.stringify(x, (key, v) => Object.is(v, -0) ? '__NEG0__' : v).replace(/"__NEG0__"/g, '-0')); }
  const text = lines.join('\n'), want = lines.map((l) => JSON.parse(l)), p = JF.pack(text), back = JF.unpack(p);
  assert.deepStrictEqual(back, want, k + ' ' + n);
  for (let i = 0; i < want.length; i++) if (Object.is(want[i].v, -0)) assert.ok(Object.is(back[i].v, -0), k + ': -0 at ' + i);
  if (zlib.zstdCompressSync && n >= 3000) assert.ok(p.length <= zlib.zstdCompressSync(Buffer.from(text)).length, k + ' ' + n + ': not larger than plain zstd');
}
console.log('ok mixed-kind keys');
})().catch((e) => { console.error(e); process.exit(1); });
