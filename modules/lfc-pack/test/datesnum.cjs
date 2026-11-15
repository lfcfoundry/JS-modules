'use strict';
// dates: 'numbers' for unpackColumns, unpackColumnsParallel and open().columns (0.13.6): date columns as epoch numbers with their unit and fmt; text stays the default
const assert = require('assert');
const JF = require('../lfc-pack.js');
(async () => {
  await JF.init();
  const N = 30000, base = 1704067200, secs = Float64Array.from({ length: N }, (_, i) => base + (i * 37 % 86400) * 5 + i), id = Int32Array.from({ length: N }, (_, i) => i);
  const msv = Float64Array.from(secs, (x, i) => x * 1000 + (i % 1000)), usv = Float64Array.from(secs, (x, i) => x * 1e6 + (i % 999983));
  const cols = { id, a: { kind: 'ts', unit: 's', values: secs, fmt: 'YYYY-MM-DD HH:MM:SS.ffffff' }, b: { kind: 'ts', unit: 'ms', values: msv, fmt: 'YYYY-MM-DDTHH:MM:SS.fff' }, c: { kind: 'ts', unit: 'us', values: usv, fmt: 'YYYY-MM-DD HH:MM:SS.ffffff' }, d: { kind: 'ts', unit: 's', values: secs } };
  const bytes = await JF.packBlock(cols, { share: false, blockBytes: 65536, level: 3 });
  const text = JF.unpackColumns(bytes);
  const num = JF.unpackColumns(bytes, { dates: 'numbers' });
  assert.strictEqual(num.length, text.length); assert.ok(num.length > 1, 'several blocks');
  let off = 0;
  for (let i = 0; i < num.length; i++) {
    const nb = num[i], tb = text[i];
    assert.ok(nb.cols.a instanceof Float64Array && nb.cols.b instanceof Float64Array, 'date columns are Float64Array');
    assert.deepStrictEqual(nb.dates.a, { unit: 'us', fmt: 'YYYY-MM-DD HH:MM:SS.ffffff' }); assert.deepStrictEqual(nb.dates.b, { unit: 'ms', fmt: 'YYYY-MM-DDTHH:MM:SS.fff' }); assert.deepStrictEqual(nb.dates.c, { unit: 'us', fmt: 'YYYY-MM-DD HH:MM:SS.ffffff' }); assert.deepStrictEqual(nb.dates.d, { unit: 'ms', fmt: 'YYYY-MM-DDTHH:MM:SS' }); assert.strictEqual(nb.dates.id, undefined);
    assert.ok(typeof tb.cols.a[0] === 'string' && tb.dates === undefined, 'text stays the default');
    for (let r = 0; r < nb.n; r += 17) { assert.strictEqual(nb.cols.a[r], secs[off + r] * 1e6); assert.strictEqual(nb.cols.b[r], msv[off + r]); assert.strictEqual(nb.cols.c[r], usv[off + r]); }
    off += nb.n;
  }
  // numbers back through ts give the same file
  const joined = await JF.unpackColumnsParallel(bytes, { dates: 'numbers' });
  assert.ok(joined.a instanceof Float64Array && joined.a.length === N); assert.deepStrictEqual(joined.dates.c, { unit: 'us', fmt: 'YYYY-MM-DD HH:MM:SS.ffffff' });
  const again = await JF.packBlock({ id, a: { kind: 'ts', unit: joined.dates.a.unit, values: joined.a, fmt: joined.dates.a.fmt }, b: { kind: 'ts', unit: joined.dates.b.unit, values: joined.b, fmt: joined.dates.b.fmt }, c: { kind: 'ts', unit: joined.dates.c.unit, values: joined.c, fmt: joined.dates.c.fmt }, d: { kind: 'ts', unit: joined.dates.d.unit, values: joined.d, fmt: joined.dates.d.fmt } }, { share: false, blockBytes: 65536, level: 3 });
  assert.ok(Buffer.compare(Buffer.from(again), Buffer.from(bytes)) === 0, 'numbers repacked as ts give the same bytes');
  const R = await JF.open(bytes), rb = await R.columns(0, { dates: 'numbers' }); assert.ok(rb.cols.a instanceof Float64Array); assert.strictEqual(rb.dates.b.unit, 'ms');
  assert.throws(() => JF.unpackColumns(bytes, { dates: 'text' }), /dates must be/);
  await assert.rejects(JF.unpackColumnsParallel(bytes, { dates: 'x' }), /dates must be/);
  console.log('datesnum ok');
})().catch((e) => { console.error(e); process.exit(1); });
