/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano intersect (Node, pass/fail only): flat, partitioned and mixed lists, 1 to 5 lists, JavaScript and WebAssembly, against a plain merge of sorted arrays.
 * Run: node modules/elias-fano/test/intersect.js */
'use strict';
const S = require('../elias-fano.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function plain(lists) {   // the distinct values present in every list
  const sets = lists.map((a) => new Set(a)); const out = []; for (const v of Array.from(sets[0]).sort((x, y) => x - y)) if (sets.every((s) => s.has(v))) out.push(v); return out;
}
function mk(R, kind, n, span) {
  const a = new Uint32Array(n); let x = Math.floor(R() * 1000);
  for (let i = 0; i < n; i++) { x += kind === 0 ? Math.floor(R() * span) : kind === 1 ? 1 : kind === 2 ? (R() < 0.5 ? 1 : 2) : R() < 0.9 ? 0 : Math.floor(R() * 50); a[i] = Math.min(x, 4294967295); }
  return a;
}
(async () => {
  await S.ready(); const wasm = S.accelerated(), R = rng(5); let cases = 0, nonEmpty = 0;
  console.log('backend: ' + (wasm ? 'WebAssembly and plain JavaScript' : 'plain JavaScript only'));
  const fixed = [[[1, 2, 3], [2, 3, 4]], [[5], [5]], [[], [1]], [[4294967295], [4294967295]], [[0, 4294967295], [0, 4294967295], [4294967295]], [[1, 1, 2, 2], [2, 2, 3]], [[1, 2, 3]], [[1, 2, 3], [4, 5, 6]]];
  const sets = fixed.map((l) => l.map((a) => Uint32Array.from(a)));
  for (let t = 0; t < 300; t++) { const k = 1 + Math.floor(R() * 5), base = 40 + Math.floor(R() * 3000), span = [3, 5, 40, 2000][Math.floor(R() * 4)]; const ls = []; for (let i = 0; i < k; i++) ls.push(mk(R, Math.floor(R() * 4), Math.max(0, Math.floor(base * (R() < 0.5 ? 1 : R() * 0.2))), span)); sets.push(ls); }
  for (const ls of sets) {
    const want = plain(ls); ls.forEach((a) => a.sort());
    for (const mode of ['flat', 'pef', 'mixed']) for (const be of wasm ? ['js', 'wasm'] : ['js']) {
      S.setBackend(be);
      const opened = ls.map((a, i) => (mode === 'flat' || (mode === 'mixed' && i % 2 === 0)) ? S.open(S.build(a)) : S.openPartitioned(S.buildPartitioned(a, { chunk: [32, 128, 256][i % 3] })));
      const got = S.intersect(opened); cases++; if (want.length) nonEmpty++;
      ok(got.length === want.length && want.every((v, i) => got[i] === v), mode + ' [' + be + '] ' + JSON.stringify(ls.map((a) => a.length)) + ': got ' + got.length + ' wanted ' + want.length);
      opened.forEach((l) => l.free());
    }
  }
  S.setBackend('auto'); let bad = 0; try { S.intersect([{}]); bad++; } catch (e) { if (!(e instanceof TypeError)) bad++; } ok(bad === 0, 'junk must throw a TypeError'); ok(S.intersect([]).length === 0, 'no lists');
  console.log('ok   elias-fano intersect: ' + cases + ' cases (' + nonEmpty + ' with a non-empty answer), flat, partitioned and mixed lists, JavaScript and WebAssembly, all equal to a plain merge');
})();
