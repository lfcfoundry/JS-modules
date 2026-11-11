// Copyright (c) 2026 LFC Foundry. MIT License.
// Since 0.8.3: numbers with more than 15 digits, more than 9 decimals, an exponent or -0 no longer send the whole block off the fast flat writer: rows must come back exact (including -0 and exponent forms) and the file stays smaller than plain zstd.
const JF = require('../lfc-pack.js'), assert = require('assert'), zlib = require('zlib');
let s = 9; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const pool = [() => r(), () => -r() * 1e-7, () => 1e21 * r(), () => -0, () => 123456789012345680000, () => 0.1 + 0.2, () => Math.round(r() * 1e6) / 1e3, () => 5e-324, () => Math.round(r() * 1000) / 100, () => (r() * 1e15) | 0];
function check(name, rows, opts) {
  const lines = rows.map((x) => JSON.stringify(x, (k, v) => Object.is(v, -0) ? '__NEG0__' : v).replace(/"__NEG0__"/g, '-0')), text = lines.join('\n'), want = lines.map((l) => JSON.parse(l)), p = JF.pack(text, opts), back = JF.unpack(p);
  assert.strictEqual(back.length, rows.length, name + ': rows');
  for (let i = 0; i < rows.length; i++) { assert.deepStrictEqual(back[i], want[i], name + ': row ' + i); if (Object.is(want[i].v, -0)) assert.ok(Object.is(back[i].v, -0), name + ': -0 at ' + i); }
  if (zlib.zstdCompressSync && rows.length >= 1000) assert.ok(p.length <= zlib.zstdCompressSync(Buffer.from(text)).length, name + ': not larger than plain zstd');
}
(async () => {
  await JF.init();
  for (const n of [50, 5000, 60000]) {
    check('mixed ' + n, Array.from({ length: n }, (_, i) => ({ a: i, v: pool[(r() * pool.length) | 0]() })));
    check('late long number ' + n, Array.from({ length: n }, (_, i) => ({ a: i, v: i < n * 0.9 ? Math.round(r() * 1000) / 100 : pool[(r() * pool.length) | 0]() })));
    check('two number keys ' + n, Array.from({ length: n }, (_, i) => ({ a: i, v: r(), w: r() < .5 ? r() * 1e300 : (r() * 100) | 0, t: 'x' + (i % 9) })));
    check('long numbers, block flat ' + n, Array.from({ length: n }, (_, i) => ({ a: i, v: r() * 1e-5 })), { block: 'flat' });
  }
  check('-0 first', [{ v: -0 }, { v: 1 }, { v: 0 }, { v: 2.5 }]);
  check('exponent forms', ['1e3', '1E3', '1.5e-7', '2E+20', '-3e5'].map((t) => ({ v: JSON.parse(t) })));
  console.log('ok long, exponent and -0 numbers');
})().catch((e) => { console.error(e); process.exit(1); });
