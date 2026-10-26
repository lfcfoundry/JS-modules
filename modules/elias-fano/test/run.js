/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano checks (Node, pass/fail only): the JavaScript and WebAssembly builders write byte-identical blobs, every query gives the same answer in both
 * backends and equals a plain binary search, on empty, tiny, duplicate, dense, sparse and full-range lists. Run: node modules/elias-fano/test/run.js [--js-only] */
'use strict';
const S = require('../elias-fano.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function mk(kind, n, seed) {
  const r = rng(seed), a = new Uint32Array(n); let x = 0;
  for (let i = 0; i < n; i++) {
    if (kind === 'dense') x += Math.floor(r() * 3);
    else if (kind === 'sparse') x += Math.floor(r() * 100000);
    else if (kind === 'dups') x += r() < 0.7 ? 0 : Math.floor(r() * 50);
    else if (kind === 'clustered') x += r() < 0.95 ? 1 : Math.floor(r() * 1e6);
    else if (kind === 'full') x = Math.floor((i + r()) * 4294967295 / n);
    else x += 1;
    a[i] = Math.min(x, 4294967295);
  }
  a.sort(); return a;
}
function lb(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
const sets = [];
sets.push(['empty', new Uint32Array(0)], ['one', new Uint32Array([7])], ['one zero', new Uint32Array([0])], ['one max', new Uint32Array([4294967295])], ['two max', new Uint32Array([4294967295, 4294967295])], ['all zero', new Uint32Array(1000)]);
let sd = 1; for (const kind of ['dense', 'sparse', 'dups', 'clustered', 'full', 'steps']) for (const n of [2, 3, 63, 64, 65, 127, 128, 129, 1000, 20000, 200000]) sets.push([kind + ' ' + n, mk(kind, n, sd++)]);
(async () => {
  await S.ready(); const wasm = S.accelerated() && !process.argv.includes('--js-only');
  console.log('backend: ' + (wasm ? (S.simd() ? 'WebAssembly with SIMD and plain JavaScript' : 'WebAssembly and plain JavaScript') : 'plain JavaScript only'));
  let queries = 0, bytes = 0;
  for (const [name, a] of sets) {
    S.setBackend('js'); const bj = S.build(a); S.setBackend('auto'); const bw = wasm ? S.build(a) : bj;
    ok(Buffer.from(bj).equals(Buffer.from(bw)), name + ': JavaScript and WebAssembly builders write different bytes');
    bytes += bj.length;
    const r = rng(a.length + 99), probes = [];
    for (let i = 0; i < 400; i++) { const k = r(); probes.push(k < 0.5 && a.length ? a[Math.floor(r() * a.length)] : k < 0.7 && a.length ? Math.min(4294967295, a[Math.floor(r() * a.length)] + 1) : k < 0.8 ? 0 : k < 0.9 ? 4294967295 : Math.floor(r() * 4294967296)); }
    const idx = []; for (let i = 0; i < 400 && a.length; i++) idx.push(Math.floor(r() * a.length));
    for (const be of wasm ? ['js', 'wasm'] : ['js']) {
      S.setBackend(be); const L = S.open(bj);
      ok(L.length === a.length, name + ' length');
      const all = L.toArray(); ok(all.length === a.length && all.every((v, i) => v === a[i]), name + ' [' + be + '] toArray');
      for (const i of idx) { ok(L.get(i) === a[i], name + ' [' + be + '] get ' + i); queries++; }
      const gm = L.getMany(Uint32Array.from(idx)); ok(idx.every((i, j) => gm[j] === a[i]), name + ' [' + be + '] getMany');
      for (const x of probes) { ok(L.nextGEQ(x) === lb(a, x), name + ' [' + be + '] nextGEQ ' + x + ': ' + L.nextGEQ(x) + ' vs ' + lb(a, x)); queries++; }
      const nm = L.nextGEQMany(Uint32Array.from(probes)); ok(probes.every((x, j) => nm[j] === lb(a, x)), name + ' [' + be + '] nextGEQMany');
      if (a.length > 5) { const s = L.slice(2, a.length - 2); ok(s.length === a.length - 4 && s.every((v, i) => v === a[i + 2]), name + ' [' + be + '] slice'); }
      L.free();
    }
  }
  S.setBackend('auto');
  let bad = 0; for (const f of [() => S.build([2, 1]), () => S.build([-1]), () => S.build([1.5]), () => S.build([4294967296])]) { try { f(); bad++; } catch (e) { if (!(e instanceof RangeError)) bad++; } }
  ok(bad === 0, 'bad input is refused with a RangeError');
  console.log('ok   elias-fano: ' + sets.length + ' lists, ' + queries + ' single queries and all batches agree' + (wasm ? ' (blobs byte-identical in JavaScript and WebAssembly)' : '') + '; ' + bytes + ' bytes of blobs');
})();
(function listSets() {
  let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const make = (nl, maxLen, maxv) => Array.from({ length: nl }, () => { const k = Math.floor(rnd() * maxLen * rnd()); return Uint32Array.from(Array.from({ length: k }, () => Math.floor(rnd() * maxv))).sort(); });
  const cases = [['empty', []], ['all empty', make(50, 0, 10)], ['graph', make(3000, 12, 94597)], ['chunked (values near 2^30)', make(40, 8, 1 << 30)], ['one per chunk (near 2^31)', make(9, 6, 2147483000)], ['dups', [[5, 5, 5], [], [0, 0], [7]]]];
  let checked = 0;
  for (const be of ['js', 'wasm']) {
    if (be === 'wasm' && !S.ready()) continue; S.setBackend(be);
    for (const [name, lists] of cases) {
      const blob = S.buildLists(lists), L = S.openLists(blob);
      ok(L.length === lists.length, name + ' length');
      for (let i = 0; i < lists.length; i++) { const g = L.get(i); ok(g.length === lists[i].length && g.every((v, j) => v === lists[i][j]), name + ' [' + be + '] list ' + i); ok(L.size(i) === lists[i].length, name + ' size'); checked++; }
      const d = L.decodeAll(); let p = 0; ok(d.offsets.length === lists.length + 1, name + ' offsets');
      for (let i = 0; i < lists.length; i++) for (const v of lists[i]) ok(d.values[p++] === v, name + ' [' + be + '] decodeAll');
      ok(p === d.values.length, name + ' decodeAll length'); L.free();
    }
  }
  S.setBackend('js'); const bj = Buffer.from(S.buildLists(cases[2][1])); S.setBackend('auto'); ok(Buffer.compare(bj, Buffer.from(S.buildLists(cases[2][1]))) === 0, 'list set blobs byte-identical in JS and wasm');
  let bad = 0; for (const f of [() => S.buildLists([[2, 1]]), () => S.buildLists([[4294967295]])]) { try { f(); bad++; } catch (e) { if (!(e instanceof RangeError)) bad++; } } ok(bad === 0, 'list sets refuse bad input');
  console.log('ok   elias-fano: list sets, ' + checked + ' lists read back exact, chunking and empty lists included');
})();

