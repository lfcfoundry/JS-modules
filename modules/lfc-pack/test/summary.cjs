// Copyright (c) 2026 LFC Foundry. MIT License.
// Column summaries (footer section 20, since 0.15.0): packColumnsParallel writes them, summary() and open().summary() read them without decoding, and they match a decode-and-compute of the same file.
'use strict';
const J = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const exactQ = (srt) => { const m = srt.length, q = []; for (let k = 0; k < 257; k++) { const pos = k / 256 * (m - 1), lo = Math.floor(pos), fr = pos - lo; q.push(fr > 0 && lo + 1 < m ? srt[lo] + fr * (srt[lo + 1] - srt[lo]) : srt[lo]); } return q; };
  const N = 50000, id = new Int32Array(N), up = new Float64Array(N), down = new Float64Array(N), mix = new Float64Array(N), ts = new Array(N), cat = new Array(N), title = new Array(N), plain = new Array(N);
  for (let i = 0; i < N; i++) { id[i] = i; up[i] = i * 0.5; down[i] = 1e6 - i; mix[i] = i % 7 ? (i * 7919) % 1000 / 8 : NaN; ts[i] = new Date(1.7e12 + i * 3000).toISOString().slice(0, 19).replace('T', ' '); cat[i] = 'k' + (i % 9); title[i] = 'title ' + (i * 2654435761 % 1e9).toString(36); plain[i] = i % 5 ? i * 3 : null; }
  const cols = { id, up, down, mix, ts, cat, title, plain }, f = await J.packColumnsParallel(cols, { blockBytes: 100000 });
  const S = J.summary(f), by = {}; S.cols.forEach((c) => { by[c.key] = c; });
  ok(S.v === 1 && S.rows === N && S.cols.length === 8 && !S.colsCut, 'header');
  ok(J.stats(f).length > 2, 'several blocks');
  ok(Object.keys(by).join() === Object.keys(cols).join(), 'key order');
  const back = J.unpackColumns(f, { nulls: 'NaN' }), join = (k) => { const out = []; for (const b of back) for (const v of b.cols[k]) out.push(v); return out; };
  for (const k of ['id', 'up', 'down', 'mix', 'plain']) {
    const v = join(k).map((x) => (x === null ? NaN : x)), c = by[k], fin = v.filter((x) => x === x);
    ok(c.type === 'num' && c.n === N, k + ' type and n');
    ok(c.nulls === N - fin.length, k + ' nulls ' + c.nulls + ' vs ' + (N - fin.length));
    ok(c.min === Math.min(...fin) && c.max === Math.max(...fin), k + ' min max');
    const asc = fin.every((x, i) => i === 0 || x >= fin[i - 1]), desc = fin.every((x, i) => i === 0 || x <= fin[i - 1]);
    ok(c.sorted === (asc ? 'asc' : desc ? 'desc' : null), k + ' sorted ' + c.sorted);
    ok(!c.hist && Array.isArray(c.q), k + ' quantile grid by default, no hist');
    const srt = Float64Array.from(fin).sort(), dv = [...new Set(srt)];
    if (c.qExact) ok(JSON.stringify(c.q) === JSON.stringify(dv) && c.qn.reduce((a, b) => a + b, 0) === fin.length && c.qn.every((m, i) => m === fin.filter((x) => x === dv[i]).length), k + ' exact values and counts');
    else { const want = exactQ(srt); ok(c.q.length === 257 && !c.qSample && c.q.every((x, i) => Math.abs(x - want[i]) <= 1e-9 * Math.max(1, Math.abs(want[i]))), k + ' exact grid'); }
  }
  ok(!by.mix.qExact && !by.mix.qSample && by.mix.q.length === 257 && by.id.q.length === 257 && by.plain.q.length === 257, 'grid kinds');
  ok(by.id.sorted === 'asc' && by.down.sorted === 'desc' && by.mix.sorted === null, 'sorted flags');
  ok(by.ts.type === 'date' && by.ts.min === Date.parse('2023-11-14T22:13:20Z') && by.ts.max === by.ts.min + (N - 1) * 3000 && by.ts.sorted === 'asc', 'date range ' + JSON.stringify(by.ts));
  ok(by.cat.type === 'text' && by.cat.distinct === 9 && by.cat.top.length === 9 && by.cat.top.reduce((a, t) => a + t[1], 0) === N && by.cat.len[0] === 2 && by.cat.len[1] === 2, 'low-variety text ' + JSON.stringify(by.cat));
  ok(by.title.type === 'text' && by.title.distinct === null && !by.title.top && by.title.len[0] === Math.min(...title.map((s) => s.length)) && by.title.len[1] === Math.max(...title.map((s) => s.length)), 'text length range');
  // quantiles: false keeps the 64-bucket hist instead
  const fh = await J.packColumnsParallel(cols, { blockBytes: 100000, quantiles: false }), Sh = J.summary(fh);
  for (const c of Sh.cols.filter((c) => c.type === 'num')) {
    const fin = join(c.key).map((x) => (x === null ? NaN : x)).filter((x) => x === x);
    ok(!c.q && Array.isArray(c.hist) && c.hist.length === 64 && c.hist.reduce((a, b) => a + b, 0) === fin.length, c.key + ' hist total');
    const h = new Array(64).fill(0), w = 64 / (c.max - c.min); fin.forEach((x) => { h[Math.min(63, ((x - c.min) * w) | 0)]++; }); ok(h.every((x, i) => x === c.hist[i]), c.key + ' hist buckets');
  }
  // dates: the grid in epoch milliseconds, read off the writer's own date numbers
  { const tv = ts.map((s) => Date.parse(s.replace(' ', 'T') + 'Z')); ok(JSON.stringify(by.ts.q) === JSON.stringify(exactQ(Float64Array.from(tv).sort())), 'date grid ' + JSON.stringify(by.ts).slice(0, 200)); }
  // a long unordered float column: the grid comes from 65,536 sampled values; every point within 1% of rank of the exact one
  { const M = 400000, v = new Float64Array(M); let sd = 5; for (let i = 0; i < M; i++) { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; v[i] = Math.exp((sd / 4294967296) * 6) + (i % 3) * 0.001; }
    const fs = await J.packColumnsParallel({ v }, {}), c = J.summary(fs).cols[0], srt = Float64Array.from(v).sort();
    const rank = (x) => { let lo = 0, hi = M; while (lo < hi) { const md = (lo + hi) >> 1; if (srt[md] < x) lo = md + 1; else hi = md; } return lo / (M - 1); };
    let worst = 0; c.q.forEach((x, k) => { worst = Math.max(worst, Math.abs(rank(x) - k / 256)); });
    console.log('  sampled grid worst rank error', worst.toFixed(4)); ok(c.qSample === 65536 && c.q.length === 257 && c.q[0] >= c.min && c.q[256] <= c.max && worst < 0.01, 'sampled grid worst rank error ' + worst.toFixed(4)); }
  // whole numbers within 4,096 of each other are counted exactly, even unordered and long
  { const M = 300000, v = new Float64Array(M); for (let i = 0; i < M; i++) v[i] = (i * 7919) % 4000; const c = J.summary(await J.packColumnsParallel({ v }, {})).cols[0];
    ok(!c.qSample && !c.qExact && JSON.stringify(c.q) === JSON.stringify(exactQ(Float64Array.from(v).sort())), 'counted grid'); }
  // line-chart pyramids (footer section 21): min, max and count of every run of `bin` rows, first and last value; empty bins NaN
  { const M = 100000, up2 = new Float64Array(M), rnd = new Float64Array(M), gap = new Array(M), tsv = new Array(M); let sd = 11;
    for (let i = 0; i < M; i++) { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; up2[i] = i * 2; rnd[i] = i >= 40000 && i < 40100 ? NaN : (sd / 4294967296) * 1000 - 500; gap[i] = i % 3 === 0 || (i >= 60000 && i < 61000) ? null : i * 0.5; tsv[i] = new Date(1.7e12 + i * 60000).toISOString().slice(0, 19); }
    const fp = await J.packColumnsParallel({ up2, rnd, gap, tsv }, {}), P = J.pyramids(fp), bin = Math.ceil(M / 4096), bins = Math.ceil(M / bin);
    ok(P && Object.keys(P).join() === 'up2,rnd,gap,tsv', 'pyramid keys ' + (P && Object.keys(P).join()));
    const vals = { up2: Array.from(up2), rnd: Array.from(rnd), gap: gap.map((x) => (x === null ? NaN : x)), tsv: tsv.map((s) => Date.parse(s + 'Z')) };
    for (const k of Object.keys(vals)) { const p = P[k], v = vals[k]; let good = p.n === M && p.bin === bin && p.min.length === bins && p.min instanceof Float64Array && p.count instanceof Uint32Array;
      for (let b = 0; b < bins && good; b++) { let mn = Infinity, mx = -Infinity, c = 0; for (let i = b * bin; i < Math.min(M, (b + 1) * bin); i++) { const x = v[i]; if (x === x) { c++; if (x < mn) mn = x; if (x > mx) mx = x; } }
        if (p.count[b] !== c || (c ? p.min[b] !== mn || p.max[b] !== mx : p.min[b] === p.min[b] || p.max[b] === p.max[b])) { good = false; console.log('  bin', k, b, p.min[b], mn, p.max[b], mx, p.count[b], c); } }
      const fin = v.filter((x) => x === x); ok(good && p.first === fin[0] && p.last === fin[fin.length - 1], k + ' pyramid bins'); }
    const R2 = await J.open(fp); ok(R2.pyramids('rnd').max[3] === P.rnd.max[3] && R2.pyramids('nope') === null, 'open().pyramids');
    ok(J.pyramids(await J.packColumnsParallel({ up2, rnd }, { pyramids: false })) === null && J.summary(await J.packColumnsParallel({ up2 }, { pyramids: false })) !== null, 'pyramids: false');
    ok(J.pyramids(await J.packColumnsParallel({ a: new Float64Array(5000) }, {})) === null, 'no pyramid under 4 rows a bin');
    const p64 = J.pyramids(await J.packColumnsParallel({ up2 }, { pyramids: { bins: 512 } }), 'up2'); ok(p64.bin === Math.ceil(M / 512) && p64.max[0] === (p64.bin - 1) * 2, 'pyramids: { bins }'); }
  // the file itself is the same with and without the section: every block byte equal, values equal
  const g = await J.packColumnsParallel(cols, { blockBytes: 100000, summary: false });
  ok(J.summary(g) === null && J.open && true, 'summary: false writes none');
  ok(J.stats(g).length === J.stats(f).length, 'same blocks');
  const bodyEnd = (b) => J.info(b).size - 16 - (b[b.length - 16] | b[b.length - 15] << 8 | b[b.length - 14] << 16 | b[b.length - 13] << 24 >>> 0);
  ok(Buffer.from(f.subarray(0, bodyEnd(g))).equals(Buffer.from(g.subarray(0, bodyEnd(g)))), 'block bytes unchanged by the section');
  assert.deepStrictEqual(J.unpackRows(f), J.unpackRows(g)); ok(true, 'rows equal');
  const R = await J.open(f); ok(JSON.stringify(R.summary()) === JSON.stringify(S), 'open().summary()');
  ok(J.summary(J.packRows([{ a: 1 }, { a: 2 }])) === null, 'packRows writes none');
  // dictionary, byte and timestamp column inputs
  const te = new TextEncoder(), lab = te.encode('x\0yy\0zzz'), dict = { kind: 'dict', labels: { bytes: lab, start: new Int32Array([0, 2, 5]), end: new Int32Array([1, 4, 8]) }, ids: new Uint8Array(6000).map((_, i) => (i % 3 === 2 ? 0 : i % 3)) };
  const bytes = te.encode('abcdefghij'), bcol = { bytes, start: new Int32Array(6000).map((_, i) => i % 5), end: new Int32Array(6000).map((_, i) => (i % 5) + 1 + (i % 3)) };
  const tcol = { kind: 'ts', unit: 's', values: Float64Array.from({ length: 6000 }, (_, i) => (i === 3 ? NaN : 1700000000 + i)) };
  const h = await J.packColumnsParallel({ d: dict, b: bcol, t: tcol });
  const H = J.summary(h), hd = H.cols[0], hb = H.cols[1], ht = H.cols[2];
  ok(hd.type === 'text' && hd.distinct === 2 && hd.nulls === 0 && hd.len[0] === 1 && hd.len[1] === 2 && hd.top[0][1] === 4000 && hd.top.reduce((a, t) => a + t[1], 0) === 6000, 'dict column ' + JSON.stringify(hd));
  ok(hb.type === 'text' && hb.len[0] === 1 && hb.len[1] === 3 && hb.n === 6000, 'byte column ' + JSON.stringify(hb));
  ok(ht.type === 'date' && ht.nulls === 1 && ht.min === 1700000000000 && ht.max === 1700005999000, 'ts column ' + JSON.stringify(ht));
  // more than 1,000 columns: the first 1,000 are described
  const wide = {}; for (let k = 0; k < 1100; k++) wide['c' + k] = Int32Array.from({ length: 300 }, (_, i) => i + k);
  const W = J.summary(await J.packColumnsParallel(wide)); ok(W.cols.length === 1000 && W.colsCut === true && W.cols[999].key === 'c999', 'colsCut');
  // a column that is not numbers or text gets a plain entry; empty and one-row tables; a text column of dates in a plain array
  const o = J.summary(await J.packColumnsParallel({ a: new Array(5000).fill(true), b: new Array(5000).fill(null), c: Array.from({ length: 5000 }, (_, i) => (i % 2 ? 1 : 'x')) }));
  ok(o.cols.every((c) => c.n === 5000 && c.type === 'other'), 'other kinds ' + JSON.stringify(o.cols.map((c) => c.type)));
  ok(J.summary(await J.packColumnsParallel({})) === null, 'empty');
  const one = J.summary(await J.packColumnsParallel({ a: [7], s: ['q'] })); ok(one.cols[0].min === 7 && one.cols[0].max === 7 && !one.cols[0].hist && one.cols[1].distinct === 1, 'one row');
  // byte-exact and a plain pack still read as before
  const ex = await J.packColumnsParallel({ a: [1, 2.5, 3], s: ['x', 'y', 'z'] }, { exact: true }); ok(J.summary(ex).cols.length === 2 && J.unpackRows(ex).length === 3, 'exact');
  { // pyramids(bytes, key, { full: true }): full() reads that column on its first call (numbers, NaN for missing, dates in ms, six-digit dates scaled)
    const M2 = 40000, v = new Float64Array(M2), w = new Int32Array(M2), du = [];
    for (let i = 0; i < M2; i++) { v[i] = i % 11 ? Math.sin(i) * 100 : NaN; w[i] = i * 3; du.push(new Date(1.7e12 + i * 1000).toISOString().slice(0, 23) + '456'); }
    const f2 = await J.packColumnsParallel({ v, w, du }, {}), P = J.pyramids(f2, { full: true }), one = J.pyramids(f2, 'v', { full: true });
    const fv = P.v.full(), fw = P.w.full(), fd = P.du.full();
    ok(fv instanceof Float64Array && fv.length === M2 && fv.every((x, i) => Object.is(x, v[i])), 'full(): number column with NaN');
    ok(fw.every((x, i) => x === w[i]), 'full(): whole numbers as Float64Array');
    ok(Math.abs(fd[5] - (1.7e12 + 5000.456)) < 1e-3 && fd[0] === P.du.min[0], 'full(): six-digit dates in ms like the bins');
    ok(P.v.full() === fv && one.full().length === M2 && J.pyramids(f2).v.full === undefined, 'full(): cached, single key, absent unless asked');
  }
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'column summaries: ' + n + ' checks passed'); process.exit(bad ? 1 : 0);
})();
