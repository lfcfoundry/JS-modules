// Copyright (c) 2026 LFC Foundry. MIT License.
// Node pass: COUNTS ONLY (bytes, calls). Node times are not reported (owner rule).
globalThis.__H = { c() {}, d() {} };
const JF = require('./inst.js'), data = require('./data.cjs');
(async () => {
  await JF.init();
  const sizes = (process.argv[2] || '1000,30000,300000').split(',').map(Number), out = [];
  for (const name of data.names) for (const n of sizes) {
    const buf = data(name, n); let A = 0, calls = 0, lost = 0, lostB = 0, rawStore = 0, incB = 0;
    __H.c = (src, r, ms, most, lv) => { calls++; A += src.length; if (r == null || r.length >= src.length) { lost++; lostB += src.length; } };
    const p = JF.pack(buf); __H.c = () => {};
    let D = 0, DI = 0, dcalls = 0; __H.d = (inL, outL) => { dcalls++; D += outL; DI += inL; };
    const rows = JF.unpack(p); __H.d = () => {};
    // stored raw frames (flat blocks): from stats
    const st = JF.stats(p); let stored = p.length - DI, storedF = 0, cols = 0;
    for (const b of st) if (b.keys) for (const c of (b.keys.cols || b.keys)) { cols++;  }
    out.push({ set: name, rows: n, inB: buf.length, outB: p.length, zIn: A, zCalls: calls, zLostCalls: lost, zLostB: lostB, winRawB: D + stored, storedRawB: stored, ampl: +(A / (D + stored)).toFixed(2), decCalls: dcalls, okRows: rows.length === n });
  }
  console.log(JSON.stringify(out, null, 0).replace(/},/g, '},\n'));
})();
