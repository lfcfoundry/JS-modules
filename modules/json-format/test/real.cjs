// Copyright (c) 2026 LFC Foundry. MIT License.
// Pack+unpack a real NDJSON file; compare to JSON.parse row by row; report sizes and times.
const fs = require('fs'), JF = require('../json-format.js');
(async () => {
  await JF.init(); const f = process.argv[2], lim = +process.argv[3] || 0;
  let buf = fs.readFileSync(f); if (lim && buf.length > lim) { const e = buf.indexOf(10, lim); buf = buf.subarray(0, e < 0 ? buf.length : e + 1); }
  let t = process.hrtime.bigint(); const c0 = process.cpuUsage();
  const p = JF.pack(buf); const tw = Number(process.hrtime.bigint() - t) / 1e6;
  t = process.hrtime.bigint(); const rows = JF.unpack(p); const tr = Number(process.hrtime.bigint() - t) / 1e6;
  t = process.hrtime.bigint(); const want = buf.toString('utf8').split('\n').filter(l => l).map(l => JSON.parse(l)); const tp = Number(process.hrtime.bigint() - t) / 1e6;
  let bad = 0; if (rows.length !== want.length) bad = -1; else for (let i = 0; i < rows.length; i++) try { require('assert').deepStrictEqual(rows[i], want[i]); } catch (e) { if (++bad < 3) console.log('row differs', i); }
  console.log(JSON.stringify({ in: buf.length, out: p.length, rows: rows.length, writeMs: tw | 0, readMs: tr | 0, parseMs: tp | 0, bad, cpuMs: Math.round((process.cpuUsage(c0).user + process.cpuUsage(c0).system) / 1000) }));
})();
