const fs = require('fs'), rows = JSON.parse('[' + fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').join(',') + ']').slice(0, 65536), n = rows.length, pb = (n + 7) >> 3;
function v1() { const seen = new Map(), keys = [], cols = [], pls = [], pk = [], px = []; let jx;
  for (let i = 0; i < n; i++) { const r = rows[i]; let q = 0; for (const k in r) { if (pk[q] === k) jx = px[q]; else { jx = seen.get(k); if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push([]); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; } q++; pls[jx][i >> 3] |= 1 << (i & 7); cols[jx].push(r[k]); } } return cols; }
function v0() { const seen = new Map(), keys = [], cols = [], pls = [], pk = [], px = []; let jx;   // no planes
  for (let i = 0; i < n; i++) { const r = rows[i]; let q = 0; for (const k in r) { if (pk[q] === k) jx = px[q]; else { jx = seen.get(k); if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push([]); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; } q++; cols[jx].push(r[k]); } } return cols; }
function v2() { const seen = new Map(), keys = [], cols = [], pls = []; let pk = null, px = null;
  for (let i = 0; i < n; i++) { const r = rows[i], ks = Object.keys(r), vs = Object.values(r); let same = pk !== null && ks.length === pk.length;
    if (same) for (let q = 0; q < ks.length; q++) if (ks[q] !== pk[q]) { same = false; break; }
    if (!same) { px = new Int32Array(ks.length); for (let q = 0; q < ks.length; q++) { let jx = seen.get(ks[q]); if (jx === undefined) { jx = keys.length; seen.set(ks[q], jx); keys.push(ks[q]); cols.push([]); pls.push(new Uint8Array(pb)); } px[q] = jx; } pk = ks; }
    const b = i >> 3, m = 1 << (i & 7); for (let q = 0; q < vs.length; q++) { const jx = px[q]; pls[jx][b] |= m; cols[jx].push(vs[q]); } } return cols; }
function v3() { const seen = new Map(), keys = [], cols = [], pls = []; let pk = null, px = null;   // keys only, then r[k]
  for (let i = 0; i < n; i++) { const r = rows[i], ks = Object.keys(r); let same = pk !== null && ks.length === pk.length;
    if (same) for (let q = 0; q < ks.length; q++) if (ks[q] !== pk[q]) { same = false; break; }
    if (!same) { px = new Int32Array(ks.length); for (let q = 0; q < ks.length; q++) { let jx = seen.get(ks[q]); if (jx === undefined) { jx = keys.length; seen.set(ks[q], jx); keys.push(ks[q]); cols.push([]); pls.push(new Uint8Array(pb)); } px[q] = jx; } pk = ks; }
    const b = i >> 3, m = 1 << (i & 7); for (let q = 0; q < ks.length; q++) { const jx = px[q]; pls[jx][b] |= m; cols[jx].push(r[ks[q]]); } } return cols; }
const F = { v0, v1, v2, v3 }, T = {}; for (const k in F) T[k] = [];
for (let r = 0; r < 9; r++) for (const k in F) { const a = performance.now(); F[k](); T[k].push(performance.now() - a); }
for (const k in F) console.log(k, T[k].sort((a, b) => a - b)[4].toFixed(1));
function w_forin() { let c = 0; for (let i = 0; i < n; i++) { const r = rows[i]; for (const k in r) c++; } return c; }
function w_load() { let c = 0; for (let i = 0; i < n; i++) { const r = rows[i]; for (const k in r) if (r[k] !== undefined) c++; } return c; }
function v5() { const seen = new Map(), keys = [], cols = [], pls = [], pk = [], px = [], cnt = []; let jx;
  for (let i = 0; i < n; i++) { const r = rows[i]; let q = 0; for (const k in r) { if (pk[q] === k) jx = px[q]; else { jx = seen.get(k); if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push(new Array(n)); cnt.push(0); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; } q++; pls[jx][i >> 3] |= 1 << (i & 7); cols[jx][cnt[jx]++] = r[k]; } }
  for (let j = 0; j < cols.length; j++) cols[j].length = cnt[j]; return cols; }
const G = { w_forin, w_load, v1, v5 }, U = {}; for (const k in G) U[k] = [];
for (let r = 0; r < 9; r++) for (const k in G) { const a = performance.now(); G[k](); U[k].push(performance.now() - a); }
for (const k in G) console.log(k, U[k].sort((a, b) => a - b)[4].toFixed(1));
