'use strict';
// typed timestamp columns for packBlock ({ kind: 'ts', unit, values, fmt }, 0.13.4): the same bytes as the text they stand for
const assert = require('assert');
const JF = require('../lfc-pack.js');
(async () => {
  await JF.init();
  const N = 20000, base = 1704067200, secs = Float64Array.from({ length: N }, (_, i) => base + (i * 37 % 86400) * 5 + i), id = Int32Array.from({ length: N }, (_, i) => i);
  const iso = (s, ms) => new Date(s * 1000 + (ms || 0)).toISOString();
  const forms = [
    ['s', undefined, (s) => iso(s).slice(0, 19)],
    ['s', 'YYYY-MM-DD HH:MM:SS', (s) => iso(s).slice(0, 19).replace('T', ' ')],
    ['s', 'YYYY-MM-DD HH:MM:SS.ffffff', (s) => iso(s).slice(0, 19).replace('T', ' ') + '.000000'],
    ['s', 'YYYY-MM-DDTHH:MM:SS.fff', (s) => iso(s).slice(0, 23)]
  ];
  for (const [unit, fmt, f] of forms) {
    const strs = Array.from(secs, f), o = { share: false, blockBytes: 65536, level: 3 };
    const a = await JF.packBlock({ id, t: strs }, Object.assign({ _nolabels: true }, o)), b = await JF.packBlock({ id, t: { kind: 'ts', unit, values: secs, fmt } }, o);
    assert.ok(a.length === b.length && a.every((x, i) => x === b[i]), 'same bytes as text: ' + unit + ' ' + fmt);
    const r = JF.unpackRows(b); for (let i = 0; i < N; i += 11) assert.strictEqual(r[i].t, strs[i], 'row ' + i);
  }
  const ms = Float64Array.from(secs, (x) => x * 1000 + 7), us = Float64Array.from(secs, (x) => x * 1e6 + 123456);
  let b = await JF.packBlock({ id, t: { kind: 'ts', unit: 'ms', values: ms } }, { share: false }), r = JF.unpackRows(b);
  assert.strictEqual(r[5].t, iso(secs[5], 7).slice(0, 23), 'ms default form');
  b = await JF.packBlock({ id, t: { kind: 'ts', unit: 'us', values: us } }, { share: false }); r = JF.unpackRows(b);
  assert.strictEqual(r[5].t, iso(secs[5]).slice(0, 19) + '.123456', 'us default form');
  b = await JF.packBlock({ id, t: { kind: 'ts', unit: 'us', values: us, fmt: 'YYYY-MM-DD HH:MM:SS.ffffff' } }, { share: false }); r = JF.unpackRows(b);
  assert.strictEqual(r[7].t, iso(secs[7]).slice(0, 19).replace('T', ' ') + '.123456', 'us with fmt');
  const nan = Float64Array.from(secs); nan[10] = NaN; b = await JF.packBlock({ id, t: { kind: 'ts', unit: 's', values: nan } }, { share: false }); r = JF.unpackRows(b);
  assert.strictEqual(r[10].t, null, 'NaN reads back as null'); assert.strictEqual(r[11].t, iso(secs[11]).slice(0, 19));
  const few = Float64Array.from({ length: N }, (_, i) => base + (i % 5)); b = await JF.packBlock({ id, t: { kind: 'ts', unit: 's', values: few } }, { share: false }); r = JF.unpackRows(b);
  assert.strictEqual(r[3].t, iso(base + 3).slice(0, 19), 'few different values (text path decides)');
  for (const bad of [{ kind: 'ts', unit: 's', values: Float64Array.from([1.5, 2, 3]), fmt: 'YYYY-MM-DD HH:MM:SS' }, { kind: 'ts', unit: 's', values: Float64Array.from([1, -2, 3]) }, { kind: 'ts', unit: 's', values: Float64Array.from([1, 2, 3]), fmt: 'bad' }]) {
    await assert.rejects(JF.packBlock({ t: bad }, { share: false }), /timestamp column/, 'bad ts column refused');
  }
  console.log('tscol ok');
})().catch((e) => { console.error(e); process.exit(1); });
