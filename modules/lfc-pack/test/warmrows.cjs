// warm({ rows }) (B76): runs the plain warm(), then packs the first 3,000 of the caller's rows three times; the same promise comes back for the same call shape, the rows are unchanged, and later saves write the same bytes. Pass/fail only.
const assert = require('assert'), L = require('../lfc-pack.js');
(async () => {
  await L.init();
  const rows = []; for (let i = 0; i < 5000; i++) rows.push({ id: i, name: 'n' + (i % 97), v: i / 8, ok: i % 3 === 0 });
  const copy = JSON.stringify(rows), before = Buffer.from(await L.packRows(rows));
  const p = L.warm({ rows }); assert.strictEqual(L.warm({ rows }), p, 'same promise for the same call shape');
  assert.strictEqual(await p, true, 'warm({ rows }) resolves true');
  assert.strictEqual(JSON.stringify(rows), copy, 'rows unchanged');
  assert.deepStrictEqual(Buffer.from(await L.packRows(rows)), before, 'same bytes after warm({ rows })');
  assert.strictEqual(await L.warm(), true, 'plain warm() still resolves true');
  assert.strictEqual(await L.warm({ rows: [] }), true, 'empty rows: the plain warm()');
  console.log('warmrows: 6 checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
