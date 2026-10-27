// Copyright (c) 2026 LFC Foundry. MIT License. A number column that starts negative and climbs by 16,777,216 or more must read back exactly (the delta form cannot hold a negative first value).
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  const sets = [[-5, 1e8, 2e8], [-1, 1e9], [-1e12, 0, 1e12], [-5, -4, -3], [-5, 100000000, 200000000, 200000000], [0, 1e9], [-0.5, 1e9], [1e9, -1e9]];
  for (const vals of sets) for (const o of [{}, { block: 'flat' }, { exact: true, block: 'flat' }]) {
    const rows = vals.map((a) => ({ a })), text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    assert.deepStrictEqual(JF.unpack(JF.pack(text, o)), rows, JSON.stringify(vals) + ' ' + JSON.stringify(o));
  }
  console.log('negative first value ok');
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
