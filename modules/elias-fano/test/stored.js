// Copyright (c) 2026 LFC Foundry. MIT License. Stored lists (since 2.4.0): buildStored keeps up to 1,023 values in the tiny layout. Every read agrees with the input,
// 63 values or fewer give the same bytes as buildTiny, openTiny refuses a longer blob as a 2.3 reader would, openAuto opens it, hostile and cut blobs are refused,
// and intersect over stored, tiny, flat, partitioned and block lists in any mix equals a plain answer.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 91; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const lb = (v, x) => { let lo = 0, hi = v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; } return lo; };
function randList(n) {
  const span = Math.pow(2, Math.floor(r() * 33)), v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(4294967295, Math.floor(r() * span));
  if (n && r() < 0.1) v[n - 1] = 4294967295; if (n && r() < 0.1) v[0] = 0; if (n > 3 && r() < 0.2) v[2] = v[1];
  return v.sort();
}
let checks = 0; const eq = (a, b, m) => { checks++; assert.strictEqual(a, b, m); };
(async () => {
  await EF.ready();
  const kinds = { 0x74: 0, 0x75: 0 };
  for (let t = 0; t < 600; t++) {
    const n = t < 6 ? [0, 1, 63, 64, 1000, 1023][t] : Math.floor(r() * 1024), v = randList(n), b = EF.buildStored(v), L = EF.openStored(b);
    kinds[b[0]]++;
    eq(L.length, n, 'length'); eq(Array.from(L.toArray()).join(), Array.from(v).join(), 'toArray n=' + n);
    if (n <= 63) eq(Array.from(b).join(), Array.from(EF.buildTiny(v)).join(), 'same bytes as buildTiny at ' + n);
    else { let refused = false; try { EF.openTiny(b); } catch (e) { refused = e instanceof RangeError; } eq(refused, true, 'openTiny refuses ' + n + ' values'); }
    eq(Array.from(EF.openAuto(b).toArray()).join(), Array.from(v).join(), 'openAuto opens a stored list');
    for (let q = 0; q < 8; q++) {
      const x = Math.floor(r() * 4294967296), i = n ? Math.floor(r() * n) : 0;
      eq(L.nextGEQ(x), lb(v, x), 'nextGEQ'); eq(L.contains(x), lb(v, x) < n && v[lb(v, x)] === x, 'contains');
      if (n) { eq(L.get(i), v[i], 'get'); eq(L.contains(v[i]), true, 'contains a member'); }
    }
    if (n > 4) eq(Array.from(L.slice(2, n - 1)).join(), Array.from(v.slice(2, n - 1)).join(), 'slice');
  }
  assert.ok(kinds[0x74] > 20 && kinds[0x75] > 20, 'both layouts used: ' + JSON.stringify(kinds));
  assert.throws(() => EF.buildStored(new Uint32Array(1024)), RangeError, '1,024 values refused');
  assert.throws(() => EF.buildStored([3, 2]), RangeError, 'going down refused');
  // a mid list built both ways: stored is smaller than flat on spread-out values
  { const v = new Uint32Array(500); let x = 0; for (let i = 0; i < 500; i++) { x += 1 + Math.floor(r() * 2000); v[i] = x; } eq(EF.buildStored(v).length < EF.build(v).length, true, 'stored smaller than flat'); }
  // cut and flipped blobs: refused or still sorted, never a crash
  for (let t = 0; t < 120; t++) {
    const v = randList(64 + Math.floor(r() * 960)), b = EF.buildStored(v);
    for (let c = 0; c < b.length; c += 1 + (b.length >> 5)) { try { EF.openStored(b.subarray(0, c)); assert.fail('cut blob opened'); } catch (e) { assert.ok(e instanceof RangeError, 'cut: ' + e); } }
    const x = b.slice(); x[Math.floor(r() * x.length)] ^= 1 << Math.floor(r() * 8);
    try { const a = EF.openStored(x).toArray(); for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1], 'flipped blob stays sorted'); } catch (e) { assert.ok(e instanceof RangeError, 'flip: ' + e); }
    checks++;
  }
  // intersect in any mix
  const mk = (kind, v) => kind === 0 ? EF.openStored(EF.buildStored(v)) : kind === 1 ? EF.open(EF.build(v)) : kind === 2 ? EF.openPartitioned(EF.buildPartitioned(v)) : kind === 3 ? EF.openBlocks(EF.buildBlocks(v)) : EF.openTiny(EF.buildTiny(v.slice(0, Math.min(63, v.length))));
  for (let t = 0; t < 300; t++) {
    const k = 2 + Math.floor(r() * 3), base = Math.floor(r() * 5000), vs = [], ls = [];
    for (let j = 0; j < k; j++) {
      const kind = Math.floor(r() * 5), n = kind === 4 ? 1 + Math.floor(r() * 63) : 1 + Math.floor(r() * 1023), v = new Uint32Array(n);
      for (let i = 0; i < n; i++) v[i] = base + Math.floor(r() * 3000); v.sort(); vs.push(v); ls.push(mk(kind, v));
    }
    const want = Array.from(new Set(vs[0])).filter(x => vs.every(v => v[lb(v, x)] === x)).join();
    eq(Array.from(EF.intersect(ls)).join(), want, 'intersect mix');
  }
  console.log('stored lists: ' + checks + ' checks pass (' + JSON.stringify(kinds) + ')');
})().catch((e) => { console.error(e); process.exit(1); });
