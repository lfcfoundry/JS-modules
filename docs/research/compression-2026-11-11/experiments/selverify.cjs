// Copyright (c) 2026 LFC Foundry. MIT License.
// same rows (JSON text) from unpack({range}) and unpack({keys, range}) in two builds, on many sets and ranges; plus timing
const [A, B] = [require(process.argv[2]), require(process.argv[3])], fs = require('fs'), W = process.argv[4];
const sets = process.argv[5].split(',');
(async () => { await A.init(); await B.init(); let bad = 0, n = 0;
  for (const s of sets) { const [f, rk, k2] = s.split(':'); const buf = fs.readFileSync(W + '/' + f); const p = A.pack(buf);
    let mn = Infinity, mx = -Infinity; for (const o of A.unpack(p, { keys: [rk] })) { const v = o[rk]; if (typeof v === 'number') { if (v < mn) mn = v; if (v > mx) mx = v; } }
    for (const fr of [[0, 0.01], [0.3, 0.31], [0, 0.1], [0.45, 0.55], [0, 1], [2, 3]]) for (const keys of [null, [k2], [rk, k2]]) {
      const o = { range: { key: rk, min: mn + (mx - mn) * fr[0], max: mn + (mx - mn) * fr[1] } }; if (keys) o.keys = keys;
      const a = JSON.stringify(A.unpack(p, o)), b = JSON.stringify(B.unpack(p, o)); n++; if (a !== b) { bad++; console.log('DIFF', f, fr, keys); } }
    const t = (L, o) => { const r = []; for (let k = 0; k < 7; k++) { const s0 = performance.now(); L.unpack(p, o); r.push(performance.now() - s0); } r.sort((x, y) => x - y); return r[3]; };
    const o1 = { range: { key: rk, min: mn, max: mn + (mx - mn) * 0.01 } };
    const oa = { range: { key: rk, min: mn, max: mx } }; console.log(f.padEnd(28), 'range1 ms', t(A, o1).toFixed(1), '->', t(B, o1).toFixed(1), ' rangeAll', t(A, oa).toFixed(1), '->', t(B, oa).toFixed(1), ' all', t(A, {}).toFixed(1));
  }
  console.log(n, 'checks,', bad, 'diffs'); })();
