// Copyright (c) 2026 LFC Foundry. MIT License.
// Range reads (rows built for the matching rows only) give the same rows, in the same key order, as filtering a full read.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 7; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const mk = (n, kind) => { const o = []; for (let i = 0; i < n; i++) {
    const x = { ts: 1000 + i * 3 + Math.floor(r() * 3), lv: ['a', 'b', 'c'][i % 3], v: Math.round(r() * 1e4) / 100 };
    if (kind === 'nulls' && r() < 0.2) x.ts = null;
    if (kind === 'missing' && r() < 0.2) delete x.ts;
    if (kind === 'text' && r() < 0.2) x.ts = 'n/a';
    if (kind === 'optional' && r() < 0.5) x.extra = i;
    if (kind === 'order' && i % 2) { const y = { v: x.v, ts: x.ts, lv: x.lv }; o.push(y); continue; }
    o.push(x); } return o; };
  for (const kind of ['plain', 'nulls', 'missing', 'text', 'optional', 'order'])
    for (const n of [40, 3000, 20000]) {
      const rows = mk(n, kind), text = rows.map((x) => JSON.stringify(x)).join('\n'), p = JF.pack(Buffer.from(text), { blockBytes: 20000 });
      const all = JF.unpack(p), vs = rows.map((x) => x.ts).filter((x) => typeof x === 'number').sort((a, b) => a - b), lo0 = vs[0], hi0 = vs[vs.length - 1];
      for (const [f0, f1] of [[0.3, 0.31], [0, 0.1], [0.45, 0.55], [0, 1], [2, 3], [0.5, 0.5]]) for (const keys of [null, ['lv'], ['ts', 'v']]) {
        const min = lo0 + (hi0 - lo0) * f0, max = lo0 + (hi0 - lo0) * f1, o = { range: { key: 'ts', min, max } }; if (keys) o.keys = keys;
        const proj = keys ? JF.unpack(p, { keys }) : all, want = proj.filter((x, i) => typeof all[i].ts === 'number' && all[i].ts >= min && all[i].ts <= max);   // projected rows keep the file's key order
        assert(JSON.stringify(JF.unpack(p, o)) === JSON.stringify(want), kind + ' n=' + n + ' range ' + f0 + '-' + f1 + ' keys ' + keys);
      }
    }
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
