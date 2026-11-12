// Copyright (c) 2026 LFC Foundry. MIT License.
// Null plane (column type N, format minor 1): a flat column of one scalar kind plus nulls keeps its typed encoding; rows come back as JSON.parse gives them.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const kinds = {
    int: (i) => Math.floor(r() * 5000), dec: (i) => Math.round(r() * 1e6) / 100, name: (i) => ['ann', 'bo', 'cy', 'di'][i % 4] + (i % 7), flag: (i) => r() < 0.5,
    ts: (i) => 1700000000000 + i * 1000, text: (i) => 'row ' + i + ' ' + r().toString(36),
  };
  const build = (n, nullAt) => { const rows = []; for (let i = 0; i < n; i++) { const o = { id: i }; for (const k in kinds) { const v = kinds[k](i); o[k] = nullAt(k, i, n) ? null : v; } rows.push(o); } return rows; };
  const shapes = {
    'one null': (k, i) => i === 3, 'null first and last': (k, i, n) => i === 0 || i === n - 1, 'all but one': (k, i) => i !== 2, 'ten percent': () => r() < 0.1, 'half': () => r() < 0.5,
    'all null': () => true, 'none': () => false,
  };
  for (const name in shapes) for (const n of [10, 300, 5000]) {
    const rows = build(n, shapes[name]), text = rows.map((x) => JSON.stringify(x)).join('\n'), p = JF.pack(Buffer.from(text), { block: 'flat' });
    assert.strictEqual(JSON.stringify(JF.unpack(p)), JSON.stringify(rows), name + ' ' + n);
    const info = JF.info(p), hasN = JF.stats(p).some((b) => (b.keys || []).some((k) => k.type === 'N'));
    assert.strictEqual(info.minor, hasN ? 1 : 0, 'minor follows the N columns: ' + name + ' ' + n);
    if (name === 'none') assert(!hasN, 'no nulls, no N column');
    if (name === 'ten percent' && n >= 300) assert(hasN, 'a nullable typed column uses N');
    // projection and range reads over N columns give the same rows as filtering a full read
    const keys = ['dec', 'name'], pj = JF.unpack(p, { keys }); assert.deepStrictEqual(pj.map((x) => x.dec), rows.map((x) => x.dec)); assert.deepStrictEqual(pj.map((x) => x.name), rows.map((x) => x.name));
    const vals = rows.map((x) => x.int).filter((x) => x !== null).sort((a, b) => a - b); if (vals.length > 2) { const lo = vals[0], hi = vals[Math.floor(vals.length / 4)];
      assert.strictEqual(JSON.stringify(JF.unpack(p, { range: { key: 'int', min: lo, max: hi } })), JSON.stringify(rows.filter((x) => x.int !== null && x.int >= lo && x.int <= hi))); }
    const ps = JF.pack(Buffer.from(text), { block: 'flat', blockBytes: 4000 }); assert.strictEqual(JSON.stringify(JF.unpack(ps)), JSON.stringify(rows), 'small blocks ' + name + ' ' + n);
  }
  // a mixed-kind column stays text, a column of arrays with nulls stays text
  const mixed = [{ a: 1, b: 'x' }, { a: 'two', b: null }, { a: null, b: 'z' }], pm = JF.pack(Buffer.from(mixed.map((x) => JSON.stringify(x)).join('\n')), { block: 'flat' });
  assert.deepStrictEqual(JF.unpack(pm), mixed);
  // a file with N columns is smaller than the same rows without the plane would be (nulls no longer force JSON text)
  const rows = build(20000, () => r() < 0.05), text = Buffer.from(rows.map((x) => JSON.stringify(x)).join('\n')), withN = JF.pack(text, { block: 'flat' });
  assert(withN.length < text.length / 6, 'N file size ' + withN.length);
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
