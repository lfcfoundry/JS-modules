// Many number paths in one nested block: more than the wasm number grouping takes (32,768), so the JavaScript fallback runs; rows must come back. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '..', 'lfc-pack.js'));
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
(async () => {
  await L.init(); let bad = 0;
  for (const n of [16000, 17000]) {   // 32,001 and 34,001 number paths
    const rows = []; for (let i = 0; i < n; i++) rows.push({ id: i, ['k' + i]: i * 1.5, a: { ['x' + i]: i } });
    const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n', want = JSON.stringify(canon(rows));
    for (const o of [{ block: 'nested' }, { block: 'nested', share: true }]) {
      const got = JSON.stringify(canon(L.unpack(L.pack(text, o))));
      if (got !== want) { bad++; console.log('rows differ', n, JSON.stringify(o)); }
    }
  }
  console.log('many number paths: bad ' + bad); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
