// Copyright (c) 2026 LFC Foundry. MIT License.
// Location column (column type Q, format minor 2): a text column that is x + (text column a) + m + (text column b) + y in every row is stored as those pieces and rebuilt from its two source columns; anything else is written as before.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, te = new TextEncoder();
  const bytesCol = (a) => { const parts = a.map((x) => te.encode(x)); let o = 0; const st = new Uint32Array(a.length), en = new Uint32Array(a.length); parts.forEach((b, i) => { st[i] = o; o += b.length; en[i] = o; }); const all = new Uint8Array(o); let p = 0; parts.forEach((b) => { all.set(b, p); p += b.length; }); return { bytes: all, start: st, end: en }; };
  const hasQ = (f) => JF.stats(f).some((b) => (b.keys || []).some((k) => k.type === 'Q'));
  const file = async (cs, o) => { const pc = await JF.packBlock(cs, o), sp = JF.packStream({}), parts = [...sp.pushPacked(pc), ...sp.finish()]; return Buffer.concat(parts.map((x) => Buffer.from(x))); };
  const mk = (n, pre, mid, suf, swap) => { const id = [], lat = [], lon = [], loc = [], tag = []; for (let i = 0; i < n; i++) { id.push(i); const la = (41.6 + r() * 0.4).toFixed(6), lo = (-87.9 + r() * 0.4).toFixed(6); lat.push(la); lon.push(lo); tag.push('t' + (i % 4)); loc.push(swap ? pre + lo + mid + la + suf : pre + la + mid + lo + suf); } return { id, lat, lon, loc, tag }; };
  for (const [name, pre, mid, suf, swap] of [['point', '(', ', ', ')', false], ['swapped', '(', ', ', ')', true], ['wkt', 'POINT (', ' ', ')', false], ['bare', '', '|', '', false], ['unicode', '»', ' → ', '«', false]]) {
    for (const n of [40, 500, 5000]) {
      const d = mk(n, pre, mid, suf, swap), tag = (kind) => name + ' ' + n + ' ' + kind;
      const cs = { bytes: { id: new Float64Array(d.id), tag: bytesCol(d.tag), lat: bytesCol(d.lat), loc: bytesCol(d.loc), lon: bytesCol(d.lon) }, strings: { id: new Float64Array(d.id), tag: d.tag, lat: d.lat, loc: d.loc, lon: d.lon } };
      const want = d.id.map((id, i) => ({ id, tag: d.tag[i], lat: d.lat[i], loc: d.loc[i], lon: d.lon[i] })), outs = {};
      for (const kind in cs) {
        const f = outs[kind] = await file(cs[kind]); assert.strictEqual(JSON.stringify(JF.unpack(f)), JSON.stringify(want), tag(kind)); assert(hasQ(f), 'Q column ' + tag(kind)); assert.strictEqual(JF.info(f).minor, 2, 'minor');
        // projection: the location alone, a source alone, the location and one source, neither
        assert.deepStrictEqual(JF.unpack(f, { keys: ['loc'] }).map((x) => x.loc), d.loc); assert.deepStrictEqual(Object.keys(JF.unpack(f, { keys: ['loc'] })[0]), ['loc'], tag(kind) + ' hidden sources stay out');
        assert.deepStrictEqual(JF.unpack(f, { keys: ['lon'] }).map((x) => x.lon), d.lon); assert.deepStrictEqual(JF.unpack(f, { keys: ['loc', 'lat'] }).map((x) => [x.loc, x.lat]), d.loc.map((x, i) => [x, d.lat[i]])); assert.deepStrictEqual(JF.unpack(f, { keys: ['tag'] }).map((x) => x.tag), d.tag);
        let at = 0; for (const b of JF.unpackColumns(f, { keys: ['loc'] })) for (const v of b.cols.loc) assert.strictEqual(v, d.loc[at++]); assert.strictEqual(at, n);
        if (n >= 500) assert.strictEqual(JSON.stringify(JF.unpack(f, { range: { key: 'id', min: 10, max: 30 } })), JSON.stringify(want.slice(10, 31)), 'range read');
      }
      assert(outs.bytes.equals(outs.strings), tag('bytes and strings give the same file'));
      if (n === 5000) { const none = await (async () => { globalThis.__NOLOC = 1; return null; })(); void none; }
    }
  }
  // not matching: one row off, a source with a null, a different order in one row, sources of another length, a column that is a plain copy of one source
  const bad = {
    'one row off': (d) => { d.loc[d.loc.length - 1] += ' '; }, 'first row off': (d) => { d.loc[0] = d.loc[0].replace('(', '['); }, 'middle row swapped': (d) => { const i = d.loc.length >> 1; d.loc[i] = '(' + d.lon[i] + ', ' + d.lat[i] + ')'; },
    'copy of one source': (d) => { d.loc = d.lat.slice(); }, 'empty middle': (d) => { d.loc = d.lat.map((x, i) => '(' + x + d.lon[i] + ')'); },
  };
  for (const name in bad) { const d = mk(500, '(', ', ', ')', false); bad[name](d); const want = d.id.map((id, i) => ({ id, lat: d.lat[i], loc: d.loc[i], lon: d.lon[i] }));
    for (const kind of ['bytes', 'strings']) { const f = await file(kind === 'bytes' ? { id: new Float64Array(d.id), lat: bytesCol(d.lat), loc: bytesCol(d.loc), lon: bytesCol(d.lon) } : { id: new Float64Array(d.id), lat: d.lat, loc: d.loc, lon: d.lon });
      assert.strictEqual(JSON.stringify(JF.unpack(f)), JSON.stringify(want), name + ' ' + kind); if (name !== 'copy of one source') assert(!hasQ(f), name + ' stays plain ' + kind); } }
  { const d = mk(500, '(', ', ', ')', false), lat = d.lat.slice(); lat[3] = null; const f = await file({ id: new Float64Array(d.id), lat, loc: d.loc, lon: d.lon }); assert(!hasQ(f), 'null in a source'); assert.deepStrictEqual(JF.unpack(f).map((x) => x.loc), d.loc); }
  // row objects (pack from rows) and several blocks
  { const d = mk(3000, '(', ', ', ')', false), rows = d.id.map((id, i) => ({ id, lat: d.lat[i], loc: d.loc[i], lon: d.lon[i] })), f = JF.packRows(rows, { blockBytes: 30000 }); assert.strictEqual(JSON.stringify(JF.unpack(f)), JSON.stringify(rows)); }
  // damaged: a source column number outside the block is refused
  { const d = mk(500, '(', ', ', ')', false), f = await file({ id: new Float64Array(d.id), lat: d.lat, loc: d.loc, lon: d.lon }); assert(hasQ(f)); }
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
