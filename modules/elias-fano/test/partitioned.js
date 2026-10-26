/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano partitioned lists (Node, pass/fail only): JavaScript and WebAssembly give the same answers as a plain sorted array for get, nextGEQ, rank,
 * slice and the batches, for chunk sizes 32 to 1024, on empty, tiny, dense, bitmap-shaped, duplicate, clustered and full-range lists. Run: node modules/elias-fano/test/partitioned.js */
'use strict';
const S = require('../elias-fano.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function mk(kind, n, seed) {
  const r = rng(seed), a = new Uint32Array(n); let x = kind === 'offset' ? 4000000000 : 0;
  for (let i = 0; i < n; i++) {
    if (kind === 'run') x += 1;                                                    // dense chunks
    else if (kind === 'bitmap') x += 1 + Math.floor(r() * 2.2);                    // about half the numbers present: bitmaps win
    else if (kind === 'sparse') x += 1 + Math.floor(r() * 100000);
    else if (kind === 'dups') x += r() < 0.7 ? 0 : Math.floor(r() * 50);
    else if (kind === 'mixed') x += (Math.floor(i / 300) % 3 === 0) ? 1 : (Math.floor(i / 300) % 3 === 1 ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 5000));
    else if (kind === 'offset') x += 1 + Math.floor(r() * 3);
    else if (kind === 'full') x = Math.floor((i + r()) * 4294967295 / n);
    a[i] = Math.min(x, 4294967295);
  }
  a.sort(); return a;
}
const lb = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
const ub = (a, x) => lb(a, x + 1 > 4294967295 ? 4294967295 : x + 1) + (x >= 4294967295 ? a.length - lb(a, 4294967295) : 0);
const sets = [['empty', new Uint32Array(0)], ['one', new Uint32Array([7])], ['max', new Uint32Array([4294967295, 4294967295])], ['zeros', new Uint32Array(300)]];
let sd = 1; for (const kind of ['run', 'bitmap', 'sparse', 'dups', 'mixed', 'offset', 'full']) for (const n of [2, 31, 32, 33, 127, 128, 129, 300, 1000, 20000]) sets.push([kind + ' ' + n, mk(kind, n, sd++)]);
(async () => {
  await S.ready(); const wasm = S.accelerated(); let queries = 0, kinds = [0, 0, 0], bytes = 0, flat = 0;
  console.log('backend: ' + (wasm ? 'WebAssembly and plain JavaScript' : 'plain JavaScript only'));
  for (const [name, a] of sets) for (const chunk of [32, 128, 256, 1024]) {
    const blob = S.buildPartitioned(a, { chunk }); bytes += blob.length; flat += a.length ? S.build(a).length : 0;
    const r = rng(a.length + chunk), probes = [0, 1, 4294967295, 4294967294];
    for (let i = 0; i < 300 && a.length; i++) { const k = r(); const v = a[Math.floor(r() * a.length)]; probes.push(k < 0.4 ? v : k < 0.6 ? Math.min(4294967295, v + 1) : k < 0.7 ? Math.max(0, v - 1) : Math.floor(r() * 4294967296)); }
    const idx = []; for (let i = 0; i < 300 && a.length; i++) idx.push(Math.floor(r() * a.length));
    for (const be of wasm ? ['js', 'wasm'] : ['js']) {
      S.setBackend(be); const L = S.openPartitioned(blob), tag = name + ' chunk ' + chunk + ' [' + be + '] ';
      ok(L.length === a.length, tag + 'length');
      const st = L.stats(); if (be === 'js') { kinds[0] += st.dense; kinds[1] += st.bitmap; kinds[2] += st.eliasFano; }
      for (const i of idx) { ok(L.get(i) === a[i], tag + 'get ' + i + ': ' + L.get(i) + ' vs ' + a[i]); queries++; }
      for (const x of probes) { ok(L.nextGEQ(x) === lb(a, x), tag + 'nextGEQ ' + x + ': ' + L.nextGEQ(x) + ' vs ' + lb(a, x)); ok(L.rank(x) === a.filter((v) => v <= x).length, tag + 'rank ' + x); queries += 2; }
      const nm = L.nextGEQMany(Uint32Array.from(probes)); ok(probes.every((x, j) => nm[j] === lb(a, x)), tag + 'nextGEQMany');
      const rm = L.rankMany(Uint32Array.from(probes)); ok(probes.every((x, j) => rm[j] === L.rank(x)), tag + 'rankMany');
      const gm = L.getMany(Uint32Array.from(idx)); ok(idx.every((i, j) => gm[j] === a[i]), tag + 'getMany');
      const all = L.toArray(); ok(all.length === a.length && all.every((v, i) => v === a[i]), tag + 'toArray');
      if (a.length > 6) { const s = L.slice(3, a.length - 2); ok(s.length === a.length - 5 && s.every((v, i) => v === a[i + 3]), tag + 'slice'); }
      L.free();
    }
  }
  // random lists: pieces of runs, bitmap-like stretches, sparse stretches and repeats, random chunk size
  const R = rng(99); let fuzz = 0;
  for (let t = 0; t < 400; t++) {
    const n = Math.floor(R() * 1500), a = new Uint32Array(n); let x = Math.floor(R() * 5e8), mode = 0, left = 0;
    for (let i = 0; i < n; i++) { if (left-- <= 0) { mode = Math.floor(R() * 5); left = 1 + Math.floor(R() * 400); } x += mode === 0 ? 1 : mode === 1 ? 1 + Math.floor(R() * 2.3) : mode === 2 ? Math.floor(R() * 9000) : mode === 3 ? 0 : 1 + Math.floor(R() * 3); a[i] = Math.min(x, 4294967295); }
    const chunk = 32 << Math.floor(R() * 6), blob = S.buildPartitioned(a, { chunk });
    for (const be of wasm ? ['js', 'wasm'] : ['js']) {
      S.setBackend(be); const L = S.openPartitioned(blob), tag = 'fuzz ' + t + ' chunk ' + chunk + ' [' + be + '] ';
      for (let q = 0; q < 60; q++) { const v = a.length && R() < 0.6 ? a[Math.floor(R() * a.length)] + (R() < 0.3 ? 1 : 0) : Math.floor(R() * 4294967296); ok(L.nextGEQ(v) === lb(a, v), tag + 'nextGEQ ' + v); if (a.length) { const i = Math.floor(R() * a.length); ok(L.get(i) === a[i], tag + 'get ' + i); } fuzz += 2; }
      const all = L.toArray(); ok(all.length === a.length && all.every((v, i) => v === a[i]), tag + 'toArray'); L.free();
    }
  }
  // damaged and hostile blobs: every one is refused at open, or opens and then answers every question without an error (JavaScript and WebAssembly)
  const M = rng(1234); let refused = 0, opened = 0;
  const bases = [mk('mixed', 700, 3), mk('bitmap', 400, 4), mk('dups', 300, 5), mk('run', 260, 6), mk('sparse', 150, 7)].map((a) => S.buildPartitioned(a, { chunk: 64 }));
  for (let t = 0; t < 4000; t++) {
    const blob = bases[t % bases.length].slice(), flips = 1 + Math.floor(M() * 3);
    for (let f = 0; f < flips; f++) { const at = M() < 0.5 ? Math.floor(M() * 64) : Math.floor(M() * blob.length); blob[at] = M() < 0.3 ? blob[at] ^ (1 << Math.floor(M() * 8)) : Math.floor(M() * 256); }
    let L = null; try { L = S.openPartitioned(blob); } catch (e) { ok(e instanceof RangeError || (e instanceof Error && /not a partitioned list/.test(e.message)), 'mutation ' + t + ': refused with the wrong kind of error: ' + e); refused++; continue; }
    opened++;
    for (const be of wasm ? ['js', 'wasm'] : ['js']) { S.setBackend(be); const L2 = S.openPartitioned(blob); try { for (let i = 0; i < L2.length; i += 7) L2.get(i); for (let q = 0; q < 20; q++) L2.nextGEQ(Math.floor(M() * 4294967296)); L2.toArray(); } catch (e) { ok(false, 'mutation ' + t + ' [' + be + '] opened but then failed: ' + e); } L2.free(); }
  }
  ok(refused > 1000, 'most mutations must be refused (' + refused + ')');
  for (const f of [() => S.openPartitioned(new Uint8Array(10)), () => S.openPartitioned(new Uint8Array(48)), () => S.openPartitioned(new Uint8Array(bases[0].subarray(0, bases[0].length - 4))), () => S.openPartitioned(S.buildPartitioned([1, 2, 3]).subarray(4))]) { let r = false; try { f(); } catch (e) { r = e instanceof RangeError || e instanceof Error; } ok(r, 'truncated or cut blobs must be refused'); }
  S.setBackend('auto');
  let bad = 0; for (const f of [() => S.buildPartitioned([2, 1]), () => S.buildPartitioned([1], { chunk: 100 }), () => S.buildPartitioned([1], { chunk: 16 })]) { try { f(); bad++; } catch (e) { if (!(e instanceof RangeError)) bad++; } }
  ok(bad === 0, 'bad input must throw a RangeError');
  console.log('ok   elias-fano partitioned: ' + sets.length + ' lists x 4 chunk sizes, ' + queries + ' single queries and all batches agree in JavaScript and WebAssembly; ' + fuzz + ' random-list queries; ' + refused + ' of 4000 damaged blobs refused at open, ' + opened + ' opened and answered safely; chunk kinds used: dense ' + kinds[0] + ', bitmap ' + kinds[1] + ', Elias-Fano ' + kinds[2] + '; ' + bytes + ' bytes vs ' + flat + ' as flat Elias-Fano');
})();
