/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano random-input check (Node, pass/fail only): seeded random lists of every awkward shape against a plain array and a binary search, JavaScript and WebAssembly. Run: node modules/elias-fano/test/fuzz.js [seeds]   (default 400; a failing seed is printed and repeats exactly) */
'use strict';
const S = require('../elias-fano.js');
const seeds = +process.argv[2] || 400;
let fails = 0;
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeList(r) {
  const shape = Math.floor(r() * 8), n = [0, 1, 2, 3, 31, 32, 33, 64, 127, 128, 129, 1000, 5000][Math.floor(r() * 13)] + (r() < 0.3 ? Math.floor(r() * 300) : 0), a = new Uint32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (shape === 0) v += Math.floor(r() * 4);                       // dense, many duplicates
    else if (shape === 1) v += 1;                                   // consecutive
    else if (shape === 2) v += Math.floor(r() * 1000);
    else if (shape === 3) v += r() < 0.01 ? Math.floor(r() * 5e7) : 0; // long runs of the same value
    else if (shape === 4) v = Math.min(4294967295, v + Math.floor(r() * 4e6));   // near the top of the range
    else if (shape === 5) v = i === n - 1 ? 4294967295 : v + Math.floor(r() * 3);  // ends at the maximum
    else if (shape === 6) v = i < n / 2 ? 0 : 4294967295;             // two values
    else v += Math.floor(Math.pow(r(), 6) * 1e6);                     // heavy tail
    if (v > 4294967295) v = 4294967295; a[i] = v;
  }
  return a;
}
const lb = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
function check(seed, be) {
  const r = rng(seed * 7919 + 13), a = makeList(r); S.setBackend(be);
  const bytes = S.build(a), L = S.open(bytes), n = a.length;
  if (L.length !== n) throw new Error('length');
  for (let k = 0; k < 40 && n; k++) { const i = Math.floor(r() * n); if (L.get(i) !== a[i]) throw new Error('get ' + i + ' ' + L.get(i) + ' vs ' + a[i]); }
  const probes = [0, 1, 4294967295, ...Array.from({ length: 30 }, () => (n && r() < 0.6 ? Math.max(0, a[Math.floor(r() * n)] + Math.floor(r() * 3) - 1) : Math.floor(r() * 4294967296)))];
  for (const x of probes) { if (L.nextGEQ(x) !== lb(a, x)) throw new Error('nextGEQ ' + x + ' ' + L.nextGEQ(x) + ' vs ' + lb(a, x)); }
  const all = L.toArray(); if (all.length !== n || a.some((v, i) => all[i] !== v)) throw new Error('toArray');
  if (n > 3) { const lo = Math.floor(r() * n), hi = lo + Math.floor(r() * (n - lo)), s = L.slice(lo, hi); if (s.length !== hi - lo || s.some((v, i) => v !== a[lo + i])) throw new Error('slice ' + lo + '..' + hi); }
  L.free(); return bytes;
}
function lists(seed, be) {
  const r = rng(seed * 104729 + 7); S.setBackend(be);
  const nl = Math.floor(r() * 60), sets = Array.from({ length: nl }, () => { const a = makeList(r); return a.length > 80 ? a.subarray(0, Math.floor(r() * 80)) : a; });
  const mx = Math.max(0, ...sets.map((a) => (a.length ? a[a.length - 1] : 0)));
  let blob; try { blob = S.buildLists(sets); } catch (e) { if (e instanceof RangeError && mx === 4294967295) return null; throw e; }
  const L = S.openLists(blob), d = L.decodeAll();
  for (let i = 0; i < nl; i++) { const g = L.get(i); if (g.length !== sets[i].length || g.some((v, j) => v !== sets[i][j])) throw new Error('list ' + i); }
  let p = 0; for (let i = 0; i < nl; i++) for (const v of sets[i]) if (d.values[p++] !== v) throw new Error('decodeAll list ' + i);
  L.free(); return blob;
}
(async () => {
await S.ready(); const wasm = S.accelerated();
for (let seed = 1; seed <= seeds; seed++) {
  try {
    const bj = check(seed, 'js'); if (wasm) { const bw = check(seed, 'wasm'); if (Buffer.compare(Buffer.from(bj), Buffer.from(bw)) !== 0) throw new Error('JS and WebAssembly blobs differ'); }
    const lj = lists(seed, 'js'); if (wasm) { const lw = lists(seed, 'wasm'); if ((lj === null) !== (lw === null) || (lj && Buffer.compare(Buffer.from(lj), Buffer.from(lw)) !== 0)) throw new Error('list set blobs differ'); }
  } catch (e) { fails++; console.log('FAIL seed ' + seed + ': ' + e.message); if (fails >= 5) break; }
}
S.setBackend('auto');
console.log(fails ? 'elias-fano fuzz: ' + fails + ' FAILED' : 'elias-fano fuzz: ' + seeds + ' seeds passed' + (wasm ? ' (JavaScript and WebAssembly)' : ' (JavaScript only)')); process.exit(fails ? 1 : 0);
})();
