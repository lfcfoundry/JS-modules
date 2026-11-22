/* Copyright (c) 2026 LFC Foundry. MIT License. elias-fano long equal runs (since 2.1.3): nextGEQ, nextGEQMany and intersect equal a plain binary search when a bucket holds a long run of
 * one value (runs of 1 to 100,000 at the start, middle and end, across word and 128-value sample edges), in WebAssembly and in plain JavaScript. Run: node modules/elias-fano/test/longruns.js */
'use strict';
const S = require('../elias-fano.js');
let n = 0; const ok = (c, m) => { n++; if (!c) { console.log('FAIL ' + m); process.exit(1); } };
function lb(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
const sets = [];
sets.push(['codex fixture', Uint32Array.from({ length: 200000 }, (_, i) => i < 100000 ? 128 : 1000000 + 20 * (i - 100000))]);
for (const run of [1, 7, 8, 9, 63, 64, 65, 127, 128, 129, 1024, 100000]) for (const where of ['start', 'middle', 'end']) {
  const pre = where === 'start' ? 0 : 3000, post = where === 'end' ? 0 : 3000, a = new Uint32Array(pre + run + post); let k = 0, v = 5;
  for (let i = 0; i < pre; i++) a[k++] = (v += 1 + (i % 37));
  const rv = v + 3; for (let i = 0; i < run; i++) a[k++] = rv; v = rv;
  for (let i = 0; i < post; i++) a[k++] = (v += 1 + (i % 41));
  sets.push([`run ${run} at ${where}`, a]);
}
sets.push(['all equal 0', new Uint32Array(70000)], ['all equal max', new Uint32Array(70000).fill(4294967295)], ['two runs', Uint32Array.from({ length: 60000 }, (_, i) => i < 30000 ? 1000 : 1001)]);
sets.push(['runs in sparse', Uint32Array.from({ length: 50000 }, (_, i) => Math.floor(i / 5000) * 1e8)]);
(async () => {
  await S.ready();
  for (const backend of S.accelerated() ? ['wasm', 'js'] : ['js']) {
    S.setBackend(backend);
    for (const [name, a] of sets) {
      const L = S.from(a), qs = new Set([0, 1, 4294967295]);
      for (let i = 0; i < a.length; i += Math.max(1, a.length >> 9)) { qs.add(a[i]); if (a[i] > 0) qs.add(a[i] - 1); if (a[i] < 4294967295) qs.add(a[i] + 1); }
      qs.add(a[a.length - 1]); for (let t = 0; t < 200; t++) qs.add(Math.floor(Math.random() * (a[a.length - 1] + 2)));
      const Q = Uint32Array.from(qs), out = new Uint32Array(Q.length);
      for (const x of Q) ok(L.nextGEQ(x) === lb(a, x), `${backend} ${name}: nextGEQ(${x})`);
      for (const k of [1, 7, 8, 9, 64, Q.length]) { const q = Q.subarray(0, Math.min(k, Q.length)); L.nextGEQMany(q, out); for (let j = 0; j < q.length; j++) ok(out[j] === lb(a, q[j]), `${backend} ${name}: nextGEQMany batch ${k} at ${j}`); }
      const other = S.from(Uint32Array.from(new Set(Array.from(Q).filter((x) => x <= a[a.length - 1]))).sort()), got = S.intersect([L, other]), want = Array.from(new Set(a)).filter((x) => qs.has(x)).sort((p, q) => p - q);
      ok(Array.from(got).join() === want.join(), `${backend} ${name}: intersect`);
      if (L.free) L.free();
    }
  }
  S.setBackend('auto');
  console.log('ok   elias-fano: long equal runs, ' + n + ' checks (nextGEQ, batches, intersect; WebAssembly and JavaScript)');
})().catch((e) => { console.error(e); process.exit(1); });
