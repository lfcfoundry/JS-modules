// Copyright (c) 2026 LFC Foundry. MIT License.
// per-column type and stored bytes for one block-family view: which columns became N, and what each column costs. usage: node cols.cjs BUILD.js file.ndjson
const fs = require('fs'); let meta = []; globalThis.__H = { c() {}, d(src, out) { if (out[0] === 123 && out[1] === 34 && out[2] === 107) meta.push(JSON.parse(Buffer.from(out).toString())); } };
const L = require(require('path').resolve(process.argv[2]));
L.init().then(() => { const p = L.pack(fs.readFileSync(process.argv[3])); L.unpack(p); const agg = {};
  for (const m of meta) m.keys.forEach((k, j) => { const c = m.cols[j], a = agg[k] || (agg[k] = { t: {}, b: 0 }); a.t[c.t] = (a.t[c.t] || 0) + 1; a.b += (c.f || []).reduce((s, f) => s + f[1], 0); });
  for (const [k, a] of Object.entries(agg)) console.log(k.padEnd(24), JSON.stringify(a.t).padEnd(22), a.b); console.log('blocks', meta.length, 'size', p.length); });
