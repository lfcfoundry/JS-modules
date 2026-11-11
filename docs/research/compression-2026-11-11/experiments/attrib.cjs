// Copyright (c) 2026 LFC Foundry. MIT License.
// Node pass, deterministic attribution only (no times): which compress calls produced bytes that are in the final file.
globalThis.__H = { c() {}, d() {} };
const fs = require('fs'), JF = require('./inst.js'), data = require('./data.cjs');
(async () => {
  await JF.init(); const sizes = process.argv[2].split(',').map(Number), out = {};
  for (const name of data.names) for (const n of sizes) {
    const buf = data(name, n); fs.writeFileSync(`www/${name}-${n}.ndjson`, buf);
    const calls = []; __H.c = (src, r) => calls.push([src.length, r == null ? -1 : r.length, r == null ? null : Buffer.from(r)]);
    const p = Buffer.from(JF.pack(buf)); __H.c = () => {};
    const res = calls.map(([s, o, r]) => [s, o, r && o < s && p.indexOf(r) >= 0 ? 1 : 0]);
    const win = res.filter(x => x[2]).reduce((a, x) => a + x[0], 0), all = res.reduce((a, x) => a + x[0], 0);
    out[`${name}-${n}`] = { calls: res, inB: buf.length, outB: p.length, zInB: all, winInB: win };
    console.log(name, n, 'calls', res.length, 'winners', res.filter(x => x[2]).length, 'zIn', all, 'winIn', win, 'wastedShareBytes', (1 - win / all).toFixed(2));
  }
  fs.writeFileSync('attrib.json', JSON.stringify(out));
})();
