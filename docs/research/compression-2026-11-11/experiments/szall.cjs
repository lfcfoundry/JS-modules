// Copyright (c) 2026 LFC Foundry. MIT License.
// sizes of the same NDJSON under several lfc-pack builds, with a row check. usage: node szall.cjs a.js,b.js file...
const fs = require('fs'), B = process.argv[2].split(',').map(p => require(require('path').resolve(p)));
Promise.all(B.map(b => b.init())).then(() => { for (const f of process.argv.slice(3)) { const t = fs.readFileSync(f), want = t.toString().trim().split('\n').map(l => JSON.stringify(JSON.parse(l)));
  const out = B.map(b => { const p = b.pack(t), got = b.unpack(p); const ok = got.length === want.length && got.every((r, i) => JSON.stringify(r) === want[i]); return p.length + (ok ? '' : ' BAD'); });
  console.log(f, t.length, out.join(' ')); } });
