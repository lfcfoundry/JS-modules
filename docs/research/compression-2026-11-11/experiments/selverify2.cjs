// Copyright (c) 2026 LFC Foundry. MIT License.
// stacked build check: unpack({range}) and unpack({keys, range}) give the same rows as filtering a full unpack of the same file (needed when the file uses types only the new build reads)
// usage: node selverify2.cjs BUILD.js dir file:rangeKey:otherKey[:blockMB],...
const L = require(require('path').resolve(process.argv[2])), fs = require('fs'), W = process.argv[3];
(async () => { await L.init(); let bad = 0, n = 0;
  for (const s of process.argv[4].split(',')) { const [f, rk, k2, bb] = s.split(':'); const p = L.pack(fs.readFileSync(W + '/' + f), bb ? { blockBytes: +bb << 20 } : {}), all = L.unpack(p);
    let mn = Infinity, mx = -Infinity; for (const o of all) { const v = o[rk]; if (typeof v === 'number') { if (v < mn) mn = v; if (v > mx) mx = v; } }
    for (const fr of [[0, 0.01], [0.3, 0.31], [0, 0.1], [0.45, 0.55], [0, 1], [2, 3]]) for (const keys of [null, [k2], [rk, k2]]) {
      const min = mn + (mx - mn) * fr[0], max = mn + (mx - mn) * fr[1], o = { range: { key: rk, min, max } }; if (keys) o.keys = keys;
      const want = all.filter(r => typeof r[rk] === 'number' && r[rk] >= min && r[rk] <= max).map(r => { if (!keys) return r; const q = {}; for (const k of Object.keys(r)) if (keys.includes(k)) q[k] = r[k]; return q; });
      const got = L.unpack(p, o); n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('DIFF', f, fr, keys, got.length, want.length); } }
    console.log(f, bb || 13, 'MB', p.length, 'bytes ok so far', n - bad, '/', n); }
  console.log(n, 'checks,', bad, 'diffs'); })();
