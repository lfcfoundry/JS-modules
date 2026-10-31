// Copyright (c) 2026 LFC Foundry. MIT License.
// unpackRows (row ranges that decode only the blocks they touch) and stats (column facts from the block headers).
'use strict';
const assert = require('assert'), JF = require('../lfc-pack.js');
(async () => {
  await JF.init();
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i, s: ['a', 'b', 'c'][i % 3], v: i % 7 ? null : i, t: 'row ' + i }));
  const text = Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  for (const o of [{ blockBytes: 20000 }, { blockBytes: 20000, block: 'nested' }, { blockBytes: 20000, exact: true }, {}]) {
    const f = JF.pack(text, o), all = JF.unpack(f);
    for (const [from, count] of [[0, 10], [1234, 100], [4990, 50], [0, undefined], [6000, 5], [2500, 0]]) {
      const got = JF.unpackRows(f, { from, count }), want = all.slice(from, count === undefined ? undefined : from + count);
      assert.deepStrictEqual(got, want, JSON.stringify(o) + ' ' + from + ',' + count);
    }
  }
  // row objects made for the range only: same objects and key order as a whole read, on sparse keys, mixed key orders and an own __proto__ key
  let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const shapes = [
    (i) => { const o = {}; if (r() < 0.7) o.a = i; if (r() < 0.5) o.b = 's' + (i % 50); if (r() < 0.3) o.c = [1, 2, i]; if (r() < 0.2) o.d = { x: i }; return o; },
    (i) => { const o = {}, ks = ['p', 'q', 'r', 's']; if (r() < 0.5) ks.reverse(); for (const kk of ks) if (r() < 0.8) o[kk] = i % 9; return o; },
    (i) => JSON.parse('{"__proto__":' + i + ',"z":"' + i + '"}')];
  for (const sh of shapes) for (const bb of [4096, undefined]) {
    const txt = Array.from({ length: 3000 }, (_, i) => JSON.stringify(sh(i))).join('\n') + '\n', f = JF.pack(txt, bb ? { blockBytes: bb } : {}), all = JF.unpack(f);
    for (let q = 0; q < 10; q++) { const from = Math.floor(r() * 3300), count = Math.floor(r() * 1500) + (q % 3); assert.strictEqual(JSON.stringify(JF.unpackRows(f, { from, count })), JSON.stringify(all.slice(from, from + count))); }
  }
  const t = JF.packTables({ a: rows.slice(0, 3000), b: rows.slice(3000) }, { blockBytes: 20000 });
  assert.deepStrictEqual(JF.unpackRows(t, { from: 10, count: 5, table: 1 }), rows.slice(3010, 3015));
  const raw = JF.pack(Buffer.from('{"a":1}\r\n\n{"a":2}\r\n'), { exact: true }); assert.deepStrictEqual(JF.unpackRows(raw, { from: 1, count: 1 }), [{ a: 2 }]);
  const st = JF.stats(JF.pack(text, { block: 'flat' })), k = Object.fromEntries(st[0].keys.map((x) => [x.key, x]));
  assert.strictEqual(k.s.type, 'D'); assert.strictEqual(k.s.distinct, 3); assert.strictEqual(k.v.type, 'j'); assert.strictEqual(k.v.nulls, rows.filter((r) => r.v === null).length); assert.strictEqual(k.id.n, 5000);
  assert.deepStrictEqual(JF.unpack(JF.pack(text, { block: 'flat' })), rows);
  console.log('ok   row ranges and stats');
})().catch((e) => { console.log('FAIL', e.stack || e); process.exit(1); });
