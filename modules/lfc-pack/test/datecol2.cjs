// Copyright (c) 2026 LFC Foundry. MIT License.
// Date forms with a space and six fraction digits (column type W forms 2, 3, 4, 6; format minor 3): they round trip byte for byte in rows, columns and bytes columns, and files that use them are minor 3. Pass/fail only.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const pad = (v, k) => String(v).padStart(k, '0');
  const mk = (n, sep, fr) => { const o = []; let t = Date.UTC(2024, 0, 1, 0, 57, 55); for (let i = 0; i < n; i++) { t += 1000 + Math.floor(r() * 900000); const d = new Date(t), s = d.toISOString(); o.push(s.slice(0, 10) + sep + s.slice(11, 19) + (fr === 6 ? '.' + pad(Math.floor(r() * 1000000), 6) : fr === 3 ? s.slice(19, 23) : '')); } return o; };
  const enc = new TextEncoder();
  const col = (parts) => { const b = parts.map((x) => enc.encode(x)); let tot = 0; b.forEach((x) => (tot += x.length)); const bytes = new Uint8Array(tot), start = new Int32Array(b.length), end = new Int32Array(b.length); let p = 0; b.forEach((x, i) => { start[i] = p; bytes.set(x, p); p += x.length; end[i] = p; }); return { bytes, start, end }; };
  const hasW = (p) => JF.stats(p).some((x) => (x.keys || []).some((k) => k.type === 'W'));
  for (const [sep, fr] of [[' ', 6], ['T', 6], [' ', 3], [' ', 0], ['T', 3], ['T', 0]]) for (const n of [300, 600, 6000, 70000]) {
    const v = mk(n, sep, fr), rows = v.map((x, i) => ({ id: i, t: x }));
    const p = JF.packRows(rows); assert.strictEqual(JSON.stringify(JF.unpackRows(p)), JSON.stringify(rows), 'rows ' + JSON.stringify([sep, fr, n]));
    assert.ok(hasW(p), 'rows use W ' + JSON.stringify([sep, fr, n]));
    const b = await JF.packBlock({ id: Float64Array.from(v, (_, i) => i), t: col(v) }, { share: false }), back = JF.unpackRows(b);
    assert.strictEqual(JSON.stringify(back.map((x) => x.t)), JSON.stringify(v), 'bytes column ' + JSON.stringify([sep, fr, n]));
    assert.ok(hasW(b), 'bytes column uses W ' + JSON.stringify([sep, fr, n]));
    const minor = JF.info(b).minor; assert.strictEqual(minor, sep === ' ' || fr === 6 ? 3 : 2, 'minor ' + JSON.stringify([sep, fr, n]) + ' got ' + minor);
  }
  // not a date: wrong separator, a mix of forms, a seventh digit, a year past 2255, a bad month all stay text and read back exactly
  const bad = [['2024-01-01 00:57:55.1234567', 'seven digits'], ['2024-01-01x00:57:55.000000', 'separator x'], ['2024-13-01 00:57:55.000000', 'month 13'], ['2300-01-01 00:57:55.000000', 'year 2300']];
  for (const [first, nm] of bad) { const v = mk(2000, ' ', 6); v[0] = first; const rows = v.map((x, i) => ({ id: i, t: x })); assert.strictEqual(JSON.stringify(JF.unpackRows(JF.packRows(rows))), JSON.stringify(rows), nm); }
  { const v = mk(2000, ' ', 6); v[1000] = v[1000].replace(' ', 'T'); const rows = v.map((x, i) => ({ id: i, t: x })); const p = JF.packRows(rows); assert.strictEqual(JSON.stringify(JF.unpackRows(p)), JSON.stringify(rows), 'mixed separators'); assert.ok(!hasW(p), 'mixed separators stay text'); }
  console.log('datecol2 ok');
})().catch((e) => { console.error(e); process.exit(1); });
