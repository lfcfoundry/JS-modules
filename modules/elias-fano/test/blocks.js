/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano block lists (Node, pass/fail only): JavaScript and WebAssembly give the same answers as a plain sorted set for get, nextGEQ, rank,
 * contains, containsMany, toArray and intersect (block lists alone, three at once, and mixed with flat lists), with and without { arrays: true }, on empty, sparse, dense, bitmap-shaped,
 * duplicate and top-of-range lists; damaged blobs are refused at open or answer without an error. Run: node modules/elias-fano/test/blocks.js */
'use strict';
const S = require('../elias-fano.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const lb = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };
function mk(kind, n, seed) {
  const r = rng(seed), a = []; let x = kind === 'top' ? 4294967295 - n * 3 : Math.floor(r() * 200000);
  for (let i = 0; i < n; i++) {
    if (kind === 'dense') x += r() < 0.9 ? 1 : 2;                                   // bitmaps
    else if (kind === 'bitmap') x += 1 + Math.floor(r() * 3);
    else if (kind === 'sparse') x += 1 + Math.floor(r() * 400);                     // Elias-Fano or arrays
    else if (kind === 'wide') x += 1 + Math.floor(r() * 300000);                    // one value a block
    else if (kind === 'dups') x += Math.floor(r() * 3);                             // repeats are kept once
    else if (kind === 'top') x += 1 + Math.floor(r() * 3);
    else x += r() < 0.002 ? Math.floor(r() * 500000) : Math.floor(r() * 3);         // mixed
    if (x > 4294967295) break; a.push(x);
  }
  return a;
}
(async () => {
  const wasm = await S.ready(); const kinds = [0, 0, 0]; let queries = 0;
  const sets = [[], [0], [4294967295], [0, 65535, 65536, 4294967295]];
  for (const kind of ['dense', 'bitmap', 'sparse', 'wide', 'dups', 'top', 'mixed']) for (const n of [50, 3000, kind === 'wide' ? 9000 : 90000]) sets.push(mk(kind, n, n + kind.length));
  const R = rng(99);
  for (const a0 of sets) {
    const a = [...new Set(a0)], has = new Set(a);
    for (const arrays of [false, true]) for (const be of wasm ? ['js', 'wasm'] : ['js']) {
      S.setBackend(be); const tag = '[' + be + (arrays ? ' arrays' : '') + ' n=' + a.length + '] ';
      const L = S.openBlocks(S.buildBlocks(a0, { arrays })), st = L.stats(); kinds[0] += st.eliasFano; kinds[1] += st.bitmap; kinds[2] += st.array;
      ok(L.length === a.length, tag + 'length');
      const all = L.toArray(); ok(all.length === a.length && all.every((v, i) => v === a[i]), tag + 'toArray');
      for (let q = 0; q < 80; q++) {
        const v = a.length && R() < 0.6 ? a[Math.floor(R() * a.length)] + Math.floor(R() * 3) - 1 : Math.floor(R() * 4294967296);
        ok(L.nextGEQ(v) === lb(a, v), tag + 'nextGEQ ' + v); ok(L.contains(v) === has.has(v), tag + 'contains ' + v); ok(L.rank(v) === lb(a, v + 1), tag + 'rank ' + v);
        if (a.length) { const i = Math.floor(R() * a.length); ok(L.get(i) === a[i], tag + 'get ' + i); }
        queries += 4;
      }
      const xs = new Uint32Array(300); for (let q = 0; q < xs.length; q++) xs[q] = a.length && q % 2 ? a[Math.floor(R() * a.length)] : Math.floor(R() * 4294967296);
      const cm = L.containsMany(xs); for (let q = 0; q < xs.length; q++) ok(cm[q] === (has.has(xs[q]) ? 1 : 0), tag + 'containsMany ' + q); queries += xs.length;
      for (const other of sets.slice(4, 25).filter((x, i) => i % 3 === 0)) {
        const b = [...new Set(other)], hb = new Set(b), want = a.filter((x) => hb.has(x));
        const B = S.openBlocks(S.buildBlocks(b, { arrays: !arrays })), got = S.intersect([L, B]); ok(got.length === want.length && want.every((x, i) => got[i] === x), tag + 'intersect with ' + b.length);
        const F = S.open(S.build(b)), gm = S.intersect([L, F]); ok(gm.length === want.length && want.every((x, i) => gm[i] === x), tag + 'intersect with a flat list');
        const C = S.openBlocks(S.buildBlocks(a.filter((x, i) => i % 3))), w3 = want.filter((x) => lb(a, x) % 3), g3 = S.intersect([L, B, C]); ok(g3.length === w3.length && w3.every((x, i) => g3[i] === x), tag + 'intersect of three');
        B.free(); F.free(); C.free(); queries += 3;
      }
      L.free();
    }
  }
  // damaged and hostile blobs: every one is refused at open, or opens and then answers every question without an error (JavaScript and WebAssembly)
  const M = rng(1234); let refused = 0, opened = 0;
  const bases = [mk('mixed', 700, 3), mk('dense', 70000, 4), mk('dups', 300, 5), mk('wide', 40, 6), mk('sparse', 900, 7)].map((a, i) => S.buildBlocks(a, { arrays: i === 4 }));
  for (let t = 0; t < 3000; t++) {
    const blob = bases[t % bases.length].slice(), flips = 1 + Math.floor(M() * 3);
    for (let f = 0; f < flips; f++) { const at = M() < 0.5 ? Math.floor(M() * Math.min(blob.length, 64 + 16 * 8)) : Math.floor(M() * blob.length); blob[at] = M() < 0.3 ? blob[at] ^ (1 << Math.floor(M() * 8)) : Math.floor(M() * 256); }
    try { S.openBlocks(blob); } catch (e) { ok(e instanceof RangeError || (e instanceof Error && /not a block list/.test(e.message)), 'mutation ' + t + ': refused with the wrong kind of error: ' + e); refused++; continue; }
    opened++;
    for (const be of wasm ? ['js', 'wasm'] : ['js']) {
      S.setBackend(be); const L2 = S.openBlocks(blob);
      try { for (let i = 0; i < L2.length; i += 97) L2.get(i); const xs = new Uint32Array(40); for (let q = 0; q < 40; q++) { xs[q] = Math.floor(M() * 4294967296); L2.nextGEQ(xs[q]); L2.contains(xs[q]); } L2.containsMany(xs); L2.toArray(); S.intersect([L2, S.openBlocks(bases[0])]); }
      catch (e) { ok(false, 'mutation ' + t + ' [' + be + '] opened but then failed: ' + e); }
      L2.free();
    }
  }
  ok(refused > 1000, 'most mutations must be refused (' + refused + ')');
  for (const f of [() => S.openBlocks(new Uint8Array(10)), () => S.openBlocks(new Uint8Array(64)), () => S.openBlocks(bases[0].subarray(0, bases[0].length - 8)), () => S.openBlocks(S.buildBlocks([1, 2, 3]).subarray(8))]) { let r = false; try { f(); } catch (e) { r = e instanceof RangeError || e instanceof Error; } ok(r, 'truncated or cut blobs must be refused'); }
  S.setBackend('auto');
  let bad = 0; for (const f of [() => S.buildBlocks([2, 1]), () => S.buildBlocks([1.5]), () => S.buildBlocks([-1]), () => S.buildBlocks([4294967296])]) { try { f(); bad++; } catch (e) { if (!(e instanceof RangeError)) bad++; } }
  ok(bad === 0, 'bad input must throw a RangeError');
  console.log('ok   elias-fano blocks: ' + sets.length + ' lists, ' + queries + ' queries agree with a plain set in JavaScript' + (wasm ? ' and WebAssembly' : '') + '; ' + refused + ' of 3000 damaged blobs refused at open, ' + opened + ' opened and answered safely; blocks used: Elias-Fano ' + kinds[0] + ', bitmap ' + kinds[1] + ', array ' + kinds[2]);
})();
