// Copyright (c) 2026 LFC Foundry. MIT License. view() (since 2.3.0): the values with no copy, the same as toArray for every list kind and both backends;
// it is short-lived (the next view overwrites the first), trim() after a view leaves every answer right, and an empty list gives an empty view.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 41; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const same = (a, b, m) => { assert.strictEqual(a.length, b.length, m + ' length'); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(m + ': value ' + i); };
(async () => {
  await EF.ready(); assert.ok(EF.accelerated(), 'needs WebAssembly');
  let checks = 0;
  for (const backend of ['auto', 'js']) {
    EF.setBackend(backend);
    for (let t = 0; t < 200; t++) {
      const n = [0, 1, 15, 16, 63, 64, 1000, 70000][t % 8] + (t % 3), v = new Uint32Array(n); let x = 0; for (let i = 0; i < n; i++) { x += Math.floor(r() * (t % 5 === 0 ? 3 : 900)); v[i] = x; }
      const kinds = [EF.open(EF.build(v)), EF.openPartitioned(EF.buildPartitioned(v)), EF.openBlocks(EF.buildBlocks(v)), EF.open(EF.build(v), { pin: true })];
      if (n <= 63) kinds.push(EF.openTiny(EF.buildTiny(v)));
      for (const L of kinds) { const want = kinds.indexOf(L) === 2 ? L.toArray() : v; same(L.view(), want, backend + ' kind ' + kinds.indexOf(L) + ' n ' + n); checks++; L.free(); }   // block lists keep each value once
    }
  }
  EF.setBackend('auto');
  // short-lived: a second view (another list) reuses the buffer, so the first view now shows the second list; view().slice() keeps a copy
  const a = Uint32Array.from({ length: 5000 }, (_, i) => i * 3), b = Uint32Array.from({ length: 5000 }, (_, i) => i * 7 + 1), A = EF.open(EF.build(a)), B = EF.open(EF.build(b));
  const va = A.view(), keep = A.view().slice(), vb = B.view();
  assert.strictEqual(va[10], b[10], 'the first view is stale after the second (documented)'); same(keep, a, 'a copy made with view().slice() stays'); same(vb, b, 'second view'); checks += 3;
  // trim after a view: answers stay right, and a fresh view works
  A.compact(); B.compact(); EF.trim(); same(A.view(), a, 'view after trim'); same(B.toArray(), b, 'toArray after trim'); assert.strictEqual(A.nextGEQ(31), 11); checks += 3;
  // growing the memory after a view empties or moves it; the list itself is fine
  const v2 = A.view(), G = EF.open(EF.build(Uint32Array.from({ length: 4000000 }, (_, i) => i))); G.toArray(); assert.ok(v2.length === 0 || v2.length === a.length, 'a view after the memory grew is empty (detached) or moved'); same(A.view(), a, 'fresh view after growth'); G.free(); checks += 2;
  // 2.3.1: toArray, slice and decodeAll decode through the same buffer, so they too make an earlier view stale; their own results are copies and stay right
  { const vc = A.view(), tb = B.toArray(); assert.strictEqual(vc[10], b[10], 'a view is stale after toArray on another list (documented)'); same(tb, b, 'toArray result'); same(A.toArray(), a, 'toArray of the first list'); checks += 3;
    const P = EF.openPartitioned(EF.buildPartitioned(a)), sl = P.slice(100, 4000); same(sl, a.subarray(100, 4000), 'partitioned slice'); same(B.toArray(), b, 'toArray after a slice'); same(sl, a.subarray(100, 4000), 'slice stays after the next decode'); checks += 3;
    const Bk = EF.openBlocks(EF.buildBlocks(b)), bt = Bk.toArray(); same(A.toArray(), a, 'flat after block'); same(bt, Bk.toArray(), 'block toArray stays'); checks += 2;
    EF.trim(); same(A.toArray(), a, 'toArray after trim'); same(Bk.toArray(), bt, 'block toArray after trim'); checks += 2;
    // many lists of growing size in a row (the buffer grows, never a wrong value), then a big one over 4 MB that gets its own block
    for (let n = 1; n <= 200000; n = Math.ceil(n * 1.7)) { const w = Uint32Array.from({ length: n }, (_, i) => i * 5 + (i & 3)), L = EF.open(EF.build(w)); same(L.toArray(), w, 'growing ' + n); same(L.toArray(), w, 'growing again ' + n); L.free(); checks += 2; }
    const big = Uint32Array.from({ length: 1500000 }, (_, i) => i * 2), Lb = EF.open(EF.build(big)); same(Lb.toArray(), big, 'over 4 MB'); same(A.toArray(), a, 'small after big'); checks += 2; }
  console.log('ok   elias-fano view: ' + checks + ' checks (flat, partitioned, block, pinned and tiny lists in WebAssembly and JavaScript; stale after the next view; trim and memory growth)');
})().catch((e) => { console.error(e); process.exit(1); });
