#!/usr/bin/env node
// elias-fano partitioned lists in one real browser at a time: sizes, answers and timings against a plain sorted Uint32Array with binary search and against flat Elias-Fano, behind the noise guard. Copyright (c) 2026 LFC Foundry. MIT License.
// Four shapes of 1,000,000 values: sparse (random gaps), clustered (runs with big jumps), half-full (about every second number present), posting (bursts like a word's document ids). Contenders take turns inside one page, in an order that turns around each round.
// Run: node tests/elias-fano-pef-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=15 (rounds), BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/elias-fano/elias-fano.js'), 'utf8'), REPS = +process.env.REPS || 15;
function pageWork(reps) {
  const S = window.EliasFano; let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 1000000, shapes = {
    sparse: () => { const a = new Uint32Array(N); let x = 0; for (let i = 0; i < N; i++) { x += 1 + Math.floor(r() * 2000); a[i] = x; } return a; },
    clustered: () => { const a = new Uint32Array(N); let x = 0; for (let i = 0; i < N; i++) { x += r() < 0.97 ? 1 : 1 + Math.floor(r() * 100000); a[i] = x; } return a; },
    'half-full': () => { const a = new Uint32Array(N); let x = 0; for (let i = 0; i < N; i++) { x += 1 + (r() < 0.5 ? 0 : 1); a[i] = x; } return a; },
    posting: () => { const a = new Uint32Array(N); let x = 0, burst = 0; for (let i = 0; i < N; i++) { if (burst <= 0) { x += 1 + Math.floor(r() * 5000); burst = 20 + Math.floor(r() * 400); } else x += 1 + (r() < 0.3 ? 1 : 0); burst--; a[i] = x; } return a; }
  };
  const out = { shapes: {}, bad: [], accelerated: S.accelerated(), simd: S.simd() };
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  S.setBackend('wasm');
  for (const name of Object.keys(shapes)) {
    const a = shapes[name](), flat = S.open(S.build(a)), p128 = S.openPartitioned(S.buildPartitioned(a, { chunk: 128 })), p256 = S.openPartitioned(S.buildPartitioned(a, { chunk: 256 }));
    const max = a[N - 1], Q = 20000, qs = new Uint32Array(Q), ix = new Uint32Array(Q); for (let i = 0; i < Q; i++) { qs[i] = Math.floor(r() * max); ix[i] = Math.floor(r() * N); }
    const bs = (x) => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
    const sz = { plain: N * 4, flat: flat.bytes.length, p128: p128.bytes.length, p256: p256.bytes.length, p128kinds: p128.stats(), p256kinds: p256.stats() };
    const sumNext = (f) => () => { let s = 0; for (let i = 0; i < Q; i++) s = (s + f(qs[i]) * (i % 5 + 1)) >>> 0; return s; };
    const sumGet = (f) => () => { let s = 0; for (let i = 0; i < Q; i++) s = (s + f(ix[i]) * (i % 5 + 1)) >>> 0; return s; };
    const chk = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s = (s + arr[i] * (i % 5 + 1)) >>> 0; return s; };
    const tasks = {
      nextGEQ: { 'binary search': sumNext(bs), 'flat EF': sumNext((x) => flat.nextGEQ(x)), 'partitioned 128': sumNext((x) => p128.nextGEQ(x)), 'partitioned 256': sumNext((x) => p256.nextGEQ(x)), 'partitioned 128 batch': () => chk(p128.nextGEQMany(qs)) },
      get: { 'plain array': sumGet((i) => a[i]), 'flat EF': sumGet((i) => flat.get(i)), 'partitioned 128': sumGet((i) => p128.get(i)), 'partitioned 256': sumGet((i) => p256.get(i)), 'partitioned 128 batch': () => chk(p128.getMany(ix)) },
      decodeAll: { 'plain array (copy)': () => chk(a.slice()), 'flat EF': () => chk(flat.toArray()), 'partitioned 128': () => chk(p128.toArray()), 'partitioned 256': () => chk(p256.toArray()) }
    };
    const res = { sizes: sz };
    for (const task of Object.keys(tasks)) {
      const fns = tasks[task], names = Object.keys(fns), got = {}, inner = task === 'decodeAll' ? 2 : 5; names.forEach((n) => { got[n] = []; });
      const ref = fns[names[0]](); for (const n of names) if (fns[n]() !== ref) out.bad.push(name + ' ' + task + ': ' + n + ' differs');
      for (let k = 0; k < reps; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) { const t0 = performance.now(); for (let q = 0; q < inner; q++) fns[n](); got[n].push((performance.now() - t0) / inner); }
      res[task] = {}; names.forEach((n) => { res[task][n] = { median: med(got[n]), best: Math.min.apply(null, got[n]) }; });
    }
    out.shapes[name] = res;
  }
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(async () => { await window.EliasFano.ready(); return (' + pageWork.toString() + ')(' + REPS + '); })()'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result; console.log('wasm ' + r.accelerated + ', simd ' + r.simd + '; noise guard tries ' + (g.tries || 0));
  for (const s of Object.keys(r.shapes)) { const x = r.shapes[s], z = x.sizes; console.log('\n== ' + s + ': plain ' + z.plain + ' B, flat EF ' + z.flat + ' B, partitioned 128 ' + z.p128 + ' B (' + JSON.stringify([z.p128kinds.dense, z.p128kinds.bitmap, z.p128kinds.eliasFano]) + ' dense/bitmap/EF chunks), partitioned 256 ' + z.p256 + ' B');
    for (const c of ['nextGEQ', 'get', 'decodeAll']) { const first = Object.keys(x[c])[0]; console.log(c + ' (ms, median / best; vs ' + first + ')\n' + T.table(Object.keys(x[c]).map((n) => ({ n, m: x[c][n].median.toFixed(3), b: x[c][n].best.toFixed(3), x: (x[c][first].median / x[c][n].median).toFixed(2) + 'x' })), [{ key: 'n', title: 'contender', align: 'left' }, { key: 'm', title: 'median ms' }, { key: 'b', title: 'best ms' }, { key: 'x', title: 'speed vs ' + first }])); } }
  if (r.bad.length) console.log('\nDIFFERENT ANSWERS: ' + r.bad.join('; '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r, calibrations: g.calibrations }));
  return !r.bad.length;
});
