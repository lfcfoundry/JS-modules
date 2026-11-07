// Copyright (c) 2026 LFC Foundry. MIT License.
// rows: 'lazy' and 'lazycols' (opt-in): same JSON text and values as plain rows; keys named i or toJSON; blocks that fall back to plain rows; damaged files.
'use strict';
const assert = require('assert'), JF = require('../lfc-pack.js');
(async () => {
  await JF.init();
  let seed = 9; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const sets = {
    dense: Array.from({ length: 30000 }, (_, i) => ({ id: i, i: i * 2, s: ['a', 'b', 'c'][i % 3], v: i % 7 ? null : i, f: r() * 1000, t: 'row ' + i, ok: i % 2 === 0, hx: (i * 2654435761 >>> 0).toString(16) })),
    sparse: Array.from({ length: 6000 }, (_, i) => { const o = { id: i }; if (r() < 0.6) o.b = 's' + (i % 40); if (r() < 0.3) o.c = [1, i]; return o; }),
    tojson: Array.from({ length: 3000 }, (_, i) => ({ toJSON: i, x: 'v' + i })),
    nested: Array.from({ length: 3000 }, (_, i) => ({ id: i, d: { x: i, y: [i, 'k'] } }))
  };
  let checks = 0;
  for (const name in sets) {
    const text = Buffer.from(sets[name].map((o) => JSON.stringify(o)).join('\n') + '\n');
    for (const po of [{}, { blockBytes: 50000 }, { block: 'nested' }]) {
      const f = JF.pack(text, po), plain = JF.unpack(f), want = plain.map((o) => JSON.stringify(o));
      for (const mode of ['lazy', 'lazycols']) {
        const got = JF.unpack(f, { rows: mode }), tag = name + ' ' + JSON.stringify(po) + ' ' + mode;
        assert.strictEqual(got.length, plain.length, tag + ' count');
        for (let k = 0; k < got.length; k++) if (JSON.stringify(got[k]) !== want[k]) assert.fail(tag + ' row ' + k + ': ' + JSON.stringify(got[k]) + ' vs ' + want[k]);
        for (let k = 0; k < got.length; k += 997) for (const key of Object.keys(plain[k])) { assert.deepStrictEqual(got[k][key], plain[k][key], tag + ' ' + key); assert.ok(key in got[k], tag + ' in'); const fk = []; for (const q in got[k]) fk.push(q); assert.ok(fk.includes(key), tag + ' for..in'); }
        checks++;
      }
    }
  }
  // a dense flat block really is lazy: no own keys, the index never shows as a key, a key named i reads its own column
  const f = JF.pack(Buffer.from(sets.dense.slice(0, 5000).map((o) => JSON.stringify(o)).join('\n') + '\n'), { block: 'flat' });
  for (const mode of ['lazy', 'lazycols']) {
    const g = JF.unpack(f, { rows: mode });
    assert.ok(Object.keys(g[5]).length === 0 && g[5].i === 10 && g[5].id === 5, mode + ' rows are getters on a class');
    checks++;
  }
  // a damaged file still fails its block checksum at unpack in both modes
  for (const mode of ['lazy', 'lazycols']) for (const at of [0.3, 0.6]) { const g = f.slice(); g[Math.floor(g.length * at)] ^= 0x55; assert.throws(() => JF.unpack(g, { rows: mode }), undefined, mode + ' damaged'); checks++; }
  console.log('lazy rows: ' + checks + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
