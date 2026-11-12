// Copyright (c) 2026 LFC Foundry. MIT License.
// packRows straight from row objects (B18b): the same values come back as through the JSON text path, files under the gate are byte-identical, and rows the row path cannot take fall back.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
  const same = (a, b, m) => assert.strictEqual(JSON.stringify(sortKeys(a)), JSON.stringify(sortKeys(b)), m);
  const flat = n => { const o = []; for (let i = 0; i < n; i++) { const x = { id: i, t: 1700000000 + i * 3, v: Math.round(r() * 1e4) / 100, ok: r() < 0.5 }; if (r() < 0.2) x.n = null; if (r() < 0.3) x.s = 'k' + Math.floor(r() * 20); o.push(x); } return o; };
  const un = b => { const u = JF.unpack(b); return u.length === 1 && Array.isArray(u[0]) ? u[0] : u; };
  // over the gate: few strings, 6000 rows
  const big = flat(6000), p1 = JF.packRows(big);
  same(un(p1), big, 'row path values');
  // under 4096 rows: the old path, so the same bytes as packing the text
  const small = flat(3000), enc = new TextEncoder();
  const text = small.map(x => JSON.stringify(x)).join('\n') + '\n';
  assert.deepStrictEqual(Array.from(JF.packRows(small)), Array.from(JF.pack(enc.encode(text))), 'under the gate: same bytes as the text path');
  // options that keep the old path: same bytes as the text path
  for (const o of [{ exact: true }, { block: 'flat' }, { share: true }]) {
    const a = JF.packRows(big, o), b = JF.pack(enc.encode(big.map(x => JSON.stringify(x)).join('\n') + '\n'), o);
    assert.deepStrictEqual(Array.from(a), Array.from(b), 'option ' + JSON.stringify(o));
  }
  // rows the row path cannot take fall back and still round trip
  const bad = [big.slice(), big.slice(), big.slice(), big.slice()];
  bad[0][100] = Object.assign({}, big[100], { nest: { a: 1 } });
  bad[1][100] = Object.assign({}, big[100], { arr: [1, 2] });
  bad[2][100] = Object.assign({}, big[100], { v: -0 });
  bad[3][100] = Object.assign({}, big[100], { d: undefined, w: 1 });
  for (let k = 0; k < bad.length; k++) { const rt = un(JF.packRows(bad[k])); same(rt, JSON.parse(JSON.stringify(bad[k])), 'fallback ' + k); }
  // many strings under 16 MB: old path (gate), values the same
  const strs = []; for (let i = 0; i < 6000; i++) strs.push({ a: 'x' + i, b: 'y' + (i % 7), c: 'z' + i });
  same(un(JF.packRows(strs)), strs, 'string heavy');
  // keys listed in a different order in a later block (a key present only sometimes): values identical
  const odd = []; for (let i = 0; i < 20000; i++) { const x = { id: i, v: i % 9 }; if (i > 10000 && i % 3 === 0) { x.extra = 1; } odd.push(x); }
  same(un(JF.packRows(odd)), odd, 'late key');
  console.log('ok row path (B18b): ' + p1.length + ' bytes for 6000 rows');
})().catch(e => { console.error(e); process.exit(1); });
