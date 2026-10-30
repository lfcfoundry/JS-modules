// Copyright (c) 2026 LFC Foundry. MIT License. unpackColumns returns the same values as unpack, column by column.
const J = require('../lfc-pack.js'), g = require('./gen.cjs'), assert = require('assert');
(async () => {
  await J.init();
  const text = g.logs(5000), rows = J.unpack(J.pack(new TextEncoder().encode(text))), cb = J.unpackColumns(J.pack(new TextEncoder().encode(text)));
  let at = 0;
  for (const b of cb) { for (const k of b.keys) { assert.strictEqual(b.present[k], null); for (let i = 0; i < b.n; i++) assert.deepStrictEqual(b.cols[k][i], rows[at + i][k], k + ' row ' + i); } at += b.n; }
  assert.strictEqual(at, rows.length);
  const sub = J.unpackColumns(J.pack(new TextEncoder().encode(text)), { keys: ['ts'] }); assert.deepStrictEqual(sub[0].keys, ['ts']);
  console.log('columns ok', rows.length, 'rows');
})().catch(e => { console.error(e); process.exit(1); });
