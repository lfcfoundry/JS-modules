// Copyright (c) 2026 LFC Foundry. MIT License.
// One huge JSON document (a top-level array whose shape outgrows the 1 MB shape buffer) packs and reads back (0.5.5 and before threw "offset is out of bounds"). Pass/fail only. Run: node modules/lfc-pack/test/bigdoc.cjs
'use strict';
const JF = require('../lfc-pack.js'), te = new TextEncoder(), td = new TextDecoder();
(async () => {
  if (JF.init) await JF.init();
  let fail = 0, s = 7; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (const n of [1000, 40000]) {
    const L = []; for (let i = 0; i < n; i++) L.push(JSON.stringify({ ts: 1760000000 + i * 3, level: ['info', 'warn', 'error'][i % 3], msg: 'réquest ' + Math.floor(r() * 5000), ok: r() < 0.5, tags: ['a', 'b'].slice(0, Math.floor(r() * 3)) }));
    const txt = '[' + L.join(',') + ']', two = txt + '\n{"after":1}\n';
    for (const exact of [false, true]) {
      let ok = false;
      try {
        const p = JF.pack(te.encode(two), exact ? { exact: true } : undefined), rows = JF.unpack(p);
        ok = rows.length === 2 && JSON.stringify(rows[0]) === txt && rows[1].after === 1 && (!exact || td.decode(JF.unpackText(p)) === two);
      } catch (e) { console.log('  ' + e.message); }
      console.log((ok ? 'ok   ' : 'FAIL ') + 'one document of ' + n + ' items plus a small row, ' + (exact ? 'exact' : 'values'));
      if (!ok) fail++;
    }
  }
  process.exit(fail ? 1 : 0);
})();
