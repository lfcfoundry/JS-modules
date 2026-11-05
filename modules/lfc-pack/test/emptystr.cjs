// Copyright (c) 2026 LFC Foundry. MIT License.
// Empty strings in text columns round-trip (0.4.15-0.4.20 dropped leading ones in the fast flat writer). Pass/fail only. Run: node modules/lfc-pack/test/emptystr.cjs
'use strict';
const JF = require('../lfc-pack.js'), pad = 'p'.repeat(80), seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const cases = [['', 'A', 'B', 'C'], ['A', '', 'B', 'C'], ['A', 'B', 'C', ''], ['', '', 'A', '', 'B', ''], ['', '', '', ''], [''], ['', 'A', 'A', 'A'],
  ['', 'v1', 'v1', 'v1', 'v1', 'v1', 'v1', 'v1'], [''].concat(seq(500, (i) => 'k' + i)), seq(4000, (i) => ['', 'x', 'y'][i % 3]),
  [''].concat(seq(50, (i) => '00000000-0000-0000-0000-' + String(i).padStart(12, '0'))), ['', '1.2', '3.4', '5.6', '7.8'], [''].concat(seq(200, (i) => 'v' + (i % 70)))];
(async () => {
  await JF.init(); let bad = 0;
  const same = (vals, got) => got.length === vals.length && got.every((r, i) => r.body === vals[i] && r.id === i);
  for (const vals of cases) {
    const rows = vals.map((body, id) => ({ id, body, pad }));
    for (const o of [{}, { block: 'flat' }, { block: 'flat', templates: false }, { block: 'nested' }]) if (!same(vals, JF.unpackRows(await JF.packRows(rows, o)))) bad++;
    if (!same(vals, JF.unpackTables(await JF.packTables({ rows })).rows)) bad++;
  }
  const vals = seq(60000, (r) => (r % 1000 === 0 ? '' : 'u' + r)), text = vals.map((body, id) => JSON.stringify({ id, body, pad })).join('\n') + '\n';
  if (!same(vals, JF.unpackRows(await JF.packParallel(Buffer.from(text), { blockBytes: 262144 })))) bad++;
  console.log((bad ? 'FAIL' : 'ok  ') + ' empty strings: ' + cases.length + ' columns x 5 ways + packParallel, bad ' + bad);
  process.exitCode = bad ? 1 : 0; if (JF.close) JF.close();
})();
