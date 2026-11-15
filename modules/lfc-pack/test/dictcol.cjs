// Copyright (c) 2026 LFC Foundry. MIT License. packBlock text columns given as { kind: 'dict', labels, ids }: the same file bytes as the same column given as text, and the same text back.
const J = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await J.init();
  let s = 11; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const enc = new TextEncoder(), opts = { level: 3, blockBytes: 2097152, share: false, fast: false };
  const byteCol = (vals) => { const parts = vals.map((v) => enc.encode(v)), st = new Int32Array(vals.length), en = new Int32Array(vals.length); let t = 0; parts.forEach((p, i) => { st[i] = t; t += p.length; en[i] = t; }); const bytes = new Uint8Array(t); parts.forEach((p, i) => bytes.set(p, st[i])); return { bytes, start: st, end: en }; };
  // labels in any order (a shared dictionary: extra labels the block never uses are fine); ids as Uint8, Uint16 or Int32
  const dictCol = (vals, extra, Ctor) => { const m = new Map(), lab = []; (extra || []).forEach((x) => { m.set(x, lab.length); lab.push(x); }); const ids = new (Ctor || Uint16Array)(vals.length); vals.forEach((v, i) => { let id = m.get(v); if (id === undefined) { id = lab.length; m.set(v, id); lab.push(v); } ids[i] = id; }); return { kind: 'dict', labels: byteCol(lab), ids }; };
  const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const pick = (L, n) => Array.from({ length: n }, () => L[Math.floor(r() * L.length)]);
  const cases = {
    low: pick(['THEFT', 'BATTERY', 'ASSAULT', 'DAMAGE', 'NARCOTICS'], 9000), one: Array(4000).fill('same'), tiny: ['a', 'b', 'a'],
    wide: pick(Array.from({ length: 700 }, (_, i) => 'label ' + i), 12000), distinct: Array.from({ length: 5000 }, (_, i) => String(i)),
    zero: pick(['a\0b', 'cc', 'd'], 3000), utf8: pick(['café', '日本', 'x'], 3000), ip: pick(['10.0.0.1', '10.0.0.2', '10.0.0.3'], 3000),
    empty: pick(['', 'x', 'yy'], 3000), hex: pick(['0123456789abcdef', 'fedcba9876543210'], 3000),
  };
  let ok = 0;
  for (const [name, vals] of Object.entries(cases)) for (const C of [Uint8Array, Uint16Array, Int32Array]) {
    if (C === Uint8Array && new Set(vals).size > 256) continue;
    for (const extra of [null, ['unused one', 'unused two']]) {
      const ex = extra && C === Uint8Array && new Set(vals).size > 253 ? null : extra;
      const A = await J.packBlock({ c: byteCol(vals) }, opts), B = await J.packBlock({ c: dictCol(vals, ex, C) }, opts);
      assert.ok(same(A, B), name + ' ' + C.name + (ex ? ' shared' : '') + ': same bytes as the text column');
      const rows = J.unpackRows(B); assert.strictEqual(rows.length, vals.length); for (let i = 0; i < vals.length; i += 37) assert.strictEqual(rows[i].c, vals[i], name + ' row ' + i);
      ok++;
    }
  }
  // two columns in one block, one of them a dictionary
  const t = pick(['x', 'y', 'z'], 5000), n = Array.from({ length: 5000 }, (_, i) => i);
  const A = await J.packBlock({ n, t: byteCol(t) }, opts), B = await J.packBlock({ n, t: dictCol(t) }, opts); assert.ok(same(A, B), 'mixed block'); ok++;
  // bad input
  await assert.rejects(J.packBlock({ c: { kind: 'dict', labels: byteCol(['a', 'b']), ids: new Uint16Array([0, 1, 5]) } }, opts), /code out of range|out of range/);
  await assert.rejects(J.packBlock({ c: dictCol(['a', 'b', 'a']), d: new Float64Array(2) }, opts), /same length/);
  console.log('dictionary columns: ' + ok + ' cases, same bytes as text, bad input fails');
})().catch((e) => { console.log(e.stack); process.exit(1); });
