// Copyright (c) 2026 LFC Foundry. MIT License.
// packBlock(columns) (0.10.27): a block given as columns packs to a piece pushPacked appends, rows read back as { key: value } in key order; text given as { bytes, start, end }
// packs to the same bytes as the same text given as JS strings (plain, dictionary, wide dictionary, non-ASCII, hex / UUID / IPv4 and 0-byte fallbacks, templates), bad input is refused.
// packColumnsParallel takes the same text columns. Pass/fail only. Run: node modules/lfc-pack/test/packblockcols.cjs
'use strict';
const JF = require('../lfc-pack.js');
(async () => {
  await JF.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
  const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const enc = new TextEncoder();
  const asBytes = (vals) => { const parts = vals.map((v) => enc.encode(v)), st = new Int32Array(vals.length), en = new Int32Array(vals.length); let p = 7; for (let i = 0; i < vals.length; i++) { st[i] = p; p += parts[i].length; en[i] = p; p += i % 3; } const b = new Uint8Array(p + 5); for (let i = 0; i < vals.length; i++) b.set(parts[i], st[i]); return { bytes: b, start: st, end: en }; };
  let seed = 9; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const hex = (k) => Array.from({ length: k }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  const N = 30000;
  const textCols = {
    plain: (i) => 'note ' + i,
    label: (i) => 'Name ' + (i % 97),
    wide: (i) => 'L' + (i % 3000),
    decimal: (i) => (i % 9 === 0 ? '' : (((i * 37) % 10000) / 100).toFixed(2)),
    date: (i) => '2026-11-' + String(1 + (i % 28)).padStart(2, '0'),
    unicode: (i) => 'é' + (i % 40) + (i % 5 ? '' : '😀'),
    uniqueUnicode: (i) => 'ü' + i,
    hex: () => hex(32), uuid: () => [hex(8), hex(4), '4' + hex(3), 'a' + hex(3), hex(12)].join('-'), ip: (i) => (i % 256) + '.' + (i % 7) + '.0.' + (i % 200),
    nul: (i) => (i % 1000 === 5 ? 'a\u0000b' : 'v' + (i % 10)),
    empty: () => '', one: () => 'same'
  };
  const ids = Int32Array.from({ length: N }, (_, i) => i), score = Float64Array.from({ length: N }, (_, i) => ((i * 37) % 10000) / 100);
  for (const [name, f] of Object.entries(textCols)) {
    const vals = Array.from({ length: N }, (_, i) => f(i));
    for (const opts of [{ share: false }, { share: false, blockBytes: 65536 }, { share: false, templates: true }, { share: false, level: 3 }]) {
      const a = await JF.packBlock({ id: ids, t: vals, s: score }, opts), b = await JF.packBlock({ id: ids, t: asBytes(vals), s: score }, opts);
      ok(same(a, b), name + ' ' + JSON.stringify(opts) + ': bytes columns give the same file as strings');
      const back = JF.unpackRows(b); ok(back.length === N && back[N - 1].t === vals[N - 1] && back[123].t === vals[123] && back[7].id === 7 && JSON.stringify(Object.keys(back[0])) === '["id","t","s"]', name + ': rows read back');
    }
  }
  // stream: pieces appended with pushPacked read back as one table
  { const st = JF.packStream({ share: false, blockBytes: 1 << 20 }), parts = []; let all = [];
    for (let c = 0; c < 4; c++) { const vals = Array.from({ length: 5000 }, (_, i) => 'r' + (c * 5000 + i) + 'ö'); all = all.concat(vals); for (const x of st.pushPacked(await JF.packBlock({ k: asBytes(vals), n: Float64Array.from(vals, (_, i) => c * 5000 + i) }, { share: false }))) parts.push(x); }
    for (const x of st.finish()) parts.push(x);
    const rows = JF.unpackRows(Buffer.concat(parts.map((p) => Buffer.from(p))));
    ok(rows.length === 20000 && rows.every((row, i) => row.k === all[i] && row.n === i), 'packStream pushPacked of column pieces'); }
  // packColumnsParallel takes text as bytes too (same file as strings)
  { const vals = Array.from({ length: 60000 }, (_, i) => 'Name ' + (i % 97)), big = Int32Array.from({ length: 60000 }, (_, i) => i * 3);
    const a = await JF.packColumnsParallel({ id: big, t: vals }, { workers: 2 }), b = await JF.packColumnsParallel({ id: big, t: asBytes(vals) }, { workers: 2 });
    ok(same(a, b), 'packColumnsParallel: bytes columns give the same file'); ok(JF.unpackRows(b)[59999].t === vals[59999], 'packColumnsParallel: rows'); }
  // inputs are left as they were (a Float64Array is read in place)
  { const f = Float64Array.from({ length: 20000 }, (_, i) => i * 0.25 - 7), f0 = f.slice(), t = asBytes(Array.from({ length: 20000 }, (_, i) => 'x' + (i % 50))), b0 = t.bytes.slice();
    const p = await JF.packBlock({ f, t }, { share: false }); ok(Buffer.compare(Buffer.from(f.buffer), Buffer.from(f0.buffer)) === 0 && Buffer.compare(Buffer.from(t.bytes), Buffer.from(b0)) === 0, 'inputs unchanged'); ok(JF.unpackRows(p)[19999].f === f0[19999], 'Float64Array read back'); }
  // refused input
  const rej = async (f, m, rx) => { let e = null; try { await f(); } catch (x) { e = x; } ok(e && rx.test(e.message), m + ' (' + (e && e.message) + ')'); };
  await rej(() => JF.packBlock({ a: [1, 2], b: [1] }, { share: false }), 'unequal lengths', /same length/);
  await rej(() => JF.packBlock({ a: new DataView(new ArrayBuffer(8)) }, { share: false }), 'a DataView', /needs an array/);
  await rej(() => JF.packBlock({ a: { bytes: new Uint8Array(4), start: new Int32Array([0, 3]), end: new Int32Array([2, 9]) } }, { share: false }), 'offsets past the bytes', /outside its bytes/);
  await rej(() => JF.packBlock({ a: { bytes: Uint8Array.from([0xff, 0x41, 0x42]), start: Int32Array.from({ length: 30 }, () => 0), end: Int32Array.from({ length: 30 }, () => 3) } }, { share: false }), 'bad UTF-8', /UTF-8/);
  await rej(() => JF.packBlock({ a: [1] }, { share: true }), 'share refused', /share/);
  { const e = await JF.packBlock({}, { share: false }); ok(JF.unpackRows(e).length === 0, 'no columns: an empty piece'); }
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'all ' + n + ' passed');
  process.exit(bad ? 1 : 0);
})();
