// 0.12.3: date columns whose values are all whole seconds are stored as seconds (date form bit 8, format minor 3): the same text comes back, the file is smaller than the plain millisecond or microsecond numbers, and one value off a whole second keeps the old form. Pass/fail only.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const mk = (n, sep, fr, frac) => { const o = []; let t = Date.UTC(2024, 0, 1, 0, 57, 55); for (let i = 0; i < n; i++) { t += 1000 * (1 + Math.floor(r() * 900)); const s = new Date(t).toISOString(); o.push(s.slice(0, 10) + sep + s.slice(11, 19) + (fr ? '.' + (frac && i === n >> 1 ? '1'.padEnd(fr, '0') : '0'.repeat(fr)) : '')); } return o; };
  const enc = new TextEncoder();
  const col = (parts) => { const b = parts.map((x) => enc.encode(x)); let tot = 0; b.forEach((x) => (tot += x.length)); const bytes = new Uint8Array(tot), start = new Int32Array(b.length), end = new Int32Array(b.length); let p = 0; b.forEach((x, i) => { bytes.set(x, p); start[i] = p; p += x.length; end[i] = p; }); return { bytes, start, end }; };
  for (const [sep, fr] of [[' ', 6], ['T', 6], [' ', 3], ['T', 3], ['T', 0], [' ', 0]]) for (const n of [40, 3000, 70000]) {
    const v = mk(n, sep, fr, false), rows = v.map((x, i) => ({ id: i, t: x }));
    const a = JF.packRows(rows); assert.strictEqual(JSON.stringify(JF.unpackRows(a)), JSON.stringify(rows), 'rows ' + JSON.stringify([sep, fr, n]));
    for (const lvl of [1, 3]) {
      const b = await JF.packBlock({ id: Float64Array.from(v, (_, i) => i), t: col(v) }, { share: false, level: lvl }), back = JF.unpackRows(b);
      assert.strictEqual(JSON.stringify(back.map((x) => x.t)), JSON.stringify(v), 'bytes column ' + JSON.stringify([sep, fr, n, lvl]));
      assert.strictEqual(JF.info(b).minor, 3, 'whole seconds are minor 3 ' + JSON.stringify([sep, fr, n]));
      if (n >= 3000) assert.ok(b.length < n * 5.5, 'seconds take about 4 bytes plus the id: ' + b.length + ' for ' + n);
    }
    if (fr) { const w = mk(n, sep, fr, true), b2 = await JF.packBlock({ id: Float64Array.from(w, (_, i) => i), t: col(w) }, { share: false }); assert.strictEqual(JSON.stringify(JF.unpackRows(b2).map((x) => x.t)), JSON.stringify(w), 'one fractional value ' + JSON.stringify([sep, fr, n])); }
  }
  console.log('datesec ok');
})().catch((e) => { console.error(e); process.exit(1); });
