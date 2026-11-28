// Copyright (c) 2026 LFC Foundry. MIT License.
// quantile / countAbove / countBelow on summary() and open().summary() (since 0.18.0): answers from the section 20 grid agree with an exact sort within the grid's rank error, exactly on exact entries.
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  let a = 11; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const N = 200000, gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const mk = (f) => { const x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = f(i); return x; };
  const cols = {
    logn: mk(() => Math.exp(gauss() * 1.5)), unif: mk(() => r() * 1000 - 300), zeros: mk(() => r() < 0.7 ? 0 : r() * 50), neg: mk(() => -Math.exp(gauss())),
    holes: mk((i) => i % 4 === 0 ? NaN : gauss() * 10), cons: mk(() => 7.5), ints: Int32Array.from({ length: N }, () => (r() * 200 | 0) - 50), wide: Int32Array.from({ length: N }, () => r() * 1e7 | 0),
    asc: mk((i) => i * 0.5 + 3), none: mk(() => NaN)
  };
  const f = await J.packColumnsParallel(cols, { blockBytes: 200000 }), S = J.summary(f), S2 = (await J.open(f)).summary();
  ok(typeof S.quantile === 'function' && Object.keys(S).indexOf('quantile') < 0 && JSON.stringify(S) === JSON.stringify(S2), 'helpers attached, not enumerable; open().summary() the same');
  ok(S.quantile('nope', 0.5) === null && S.countAbove('none', 1) === null && S.quantile('none', 0.5) === null, 'no grid -> null');
  let e1 = null; try { S.quantile('logn', 1.5); } catch (e) { e1 = e; } ok(e1 && /p must/.test(e1.message), 'p out of range refused');
  for (const key in cols) {
    if (key === 'none') continue;
    const v = Array.from(cols[key]).filter((x) => x === x).sort((p, q) => p - q), M = v.length, c = S.cols.find((x) => x.key === key), exact = !!c.qExact || c.qSample === undefined && c.q.length === 257 && key === 'asc';
    const below = (x) => { let lo = 0, hi = M; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; } return lo; }, atMost = (x) => { let lo = 0, hi = M; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] <= x) lo = m + 1; else hi = m; } return lo; };
    const tol = exact ? 0 : Math.ceil(M * 0.006) + 1;
    let worstQ = 0, worstC = 0;
    for (let k = 0; k <= 100; k++) { const p = k / 100, x = S.quantile(key, p), lo = below(x), hi = atMost(x), want = p * (M - 1); const d = want < lo ? lo - want : want > hi - 1 ? want - (hi - 1) : 0; worstQ = Math.max(worstQ, d); }
    const probes = [v[0] - 1, v[0], v[M - 1], v[M - 1] + 1]; for (let k = 0; k < 60; k++) probes.push(v[(r() * M) | 0], v[0] + r() * (v[M - 1] - v[0]));
    for (const x of probes) { worstC = Math.max(worstC, Math.abs(S.countAbove(key, x) - (M - atMost(x))), Math.abs(S.countBelow(key, x) - below(x))); }
    ok(worstQ <= Math.max(tol, 1), key + ': quantile rank error ' + worstQ.toFixed(1) + ' of ' + M + ' (allowed ' + tol + ')');
    ok(worstC <= tol, key + ': count error ' + worstC + ' of ' + M + ' (allowed ' + tol + ')' + (c.qExact ? ' exact entry' : ''));
    ok(S.countAbove(key, v[0] - 1) === M && S.countAbove(key, v[M - 1]) === 0 && S.countBelow(key, v[0]) === 0 && S.countBelow(key, v[M - 1] + 1) === M, key + ': ends exact');
    ok(S.quantile(key, 0) === v[0] && S.quantile(key, 1) === v[M - 1], key + ': p 0 and 1 are min and max');
  }
  { // dates in epoch ms; a Date is taken too
    const t = Array.from({ length: 5000 }, (_, i) => new Date(1.7e12 + ((i * 7919) % 5000) * 3600e3)), fd = await J.packColumnsParallel({ t: t.map((d) => d.toISOString()) }), Sd = J.summary(fd), c = Sd.cols[0];
    const ms = t.map((d) => d.getTime()).sort((p, q) => p - q), x = new Date(ms[1234]);
    ok(c.type === 'date' && Math.abs(Sd.countBelow('t', x) - 1234) <= 31 && Sd.countBelow('t', x) === Sd.countBelow('t', x.getTime()), 'date column: Date and ms agree');
    ok(Math.abs(Sd.quantile('t', 0.5) - ms[2499]) <= 3600e3 * 30, 'date median in ms');
  }
  { // tail points (since 0.24.0): the far tails of a skewed column read close to an exact sort, and old readers still find the 257 even steps
    const lg = cols.logn, srt = Float64Array.from(lg).sort(), ex = (p) => { const R = p * (N - 1), lo = Math.floor(R); return lo + 1 < N ? srt[lo] + (R - lo) * (srt[lo + 1] - srt[lo]) : srt[lo]; }, c = S.cols.find((x) => x.key === 'logn');
    ok(Array.isArray(c.qt) && c.qt.length === 40 && c.q.length === 257, 'qt: 40 tail values beside the 257 steps');
    let worst = 0; for (const p of [0.001, 0.003, 0.997, 0.999, 0.9995]) worst = Math.max(worst, Math.abs(S.quantile('logn', p) / ex(p) - 1)); ok(worst < 0.05, 'tail quantiles within 5% (worst ' + (worst * 100).toFixed(2) + '%)');
    { const x99 = ex(0.99), a99 = N - srt.findIndex((v) => v > x99), got = S.countAbove('logn', x99); ok(Math.abs(got - a99) <= a99 * 0.04, 'sampled grid not biased in the tail: countAbove at the 99th percentile within 4% (' + got + ' vs ' + a99 + ')'); }
    const x = ex(0.999), above = N - srt.findIndex((v) => v > x); ok(Math.abs(S.countAbove('logn', x) - above) <= above * 0.15, 'countAbove at the 99.9th percentile within 15% (' + S.countAbove('logn', x) + ' vs ' + above + ')');
  }
  { // exact tails (since 0.26.0): in a sampled grid (more than 65,536 rows, several blocks) every point in the outer 1/90.5 equals the exact sort's value there, on skewed, trending and repeated data
    const M = 300000, mk2 = (f) => { const x = new Float64Array(M); for (let i = 0; i < M; i++) x[i] = f(i); return x; };
    const T = { logn2: mk2(() => Math.exp(gauss() * 1.2)), cents: mk2(() => Math.round(Math.exp(2 + gauss() * 0.8) * 100) / 100), trend: mk2((i) => i / 1000 + gauss() * 5), counts: mk2(() => Math.floor(Math.exp(gauss() * 2)) * (r() < 0.02 ? -1 : 1)) };
    const ft = await J.packColumnsParallel(T, { blockBytes: 300000 }), St = J.summary(ft);
    const QS = []; for (let k = 0; k < 257; k++) QS.push([k / 256, 0, k]); for (let j = 0; j < 20; j++) { QS.push([Math.pow(2, -(32 - j) / 2), 1, j]); QS.push([1 - Math.pow(2, -(13 + j) / 2), 1, 20 + j]); }
    for (const key in T) {
      const c = St.cols.find((x) => x.key === key), v = Float64Array.from(T[key]).sort(), at = (p) => { const R = p * (M - 1), lo = Math.floor(R); return R > lo && lo + 1 < M ? v[lo] + (R - lo) * (v[lo + 1] - v[lo]) : v[lo]; };
      let tails = 0, off = 0; if (c.qExact) { ok(true, key + ': exact entry'); continue; }
      for (const [p, t, k] of QS) { if (p > 1 / 90.5 && p < 1 - 1 / 90.5) continue; tails++; const got = t ? c.qt[k] : c.q[k]; if (k === 0 && !t || k === 256 && !t) continue; if (got !== at(p)) off++; }
      ok(c.qSample > 0 && off === 0, key + ': ' + (tails - off) + ' of ' + tails + ' tail points exact (sampled grid of ' + c.qSample + ')');
    }
  }
  { // the sample sort's paths (whole hundredths, whole numbers, top words, crowded top words, mixed signs): a grid read from every value matches an exact sort exactly
    const M = 60000, mk3 = (f) => { const x = new Float64Array(M); for (let i = 0; i < M; i++) x[i] = f(i); return x; };
    const P = { cents: mk3(() => Math.round(r() * 5e6) / 100), whole: mk3(() => Math.round((r() - 0.3) * 1e6)), floats: mk3(() => gauss() * 1e3), ms: mk3(() => 1.7e12 + Math.floor(r() * 3e10)), crowd: mk3((i) => i % 50 ? 1.7e12 + Math.floor(r() * 6e5) : 0), tiny: mk3(() => (r() - 0.5) * 1e-300) };
    const fp = await J.packColumnsParallel(P), Sp = J.summary(fp);
    for (const key in P) { const c = Sp.cols.find((x) => x.key === key), v = Float64Array.from(P[key]).sort(); let off = 0;
      for (let k = 0; k < 257; k++) { const R = k / 256 * (M - 1), lo = Math.floor(R), w = R > lo ? v[lo] + (R - lo) * (v[lo + 1] - v[lo]) : v[lo]; if (c.q[k] !== w) off++; }
      ok(!c.qSample && off === 0, key + ': grid from every value matches an exact sort (' + off + ' off)'); }
  }
  { // tied values (qv, since 0.26.2): counts above and below a value many rows share; exact in the tails (every value kept there), within the grid's 0.44% rank error in the middle (sampled)
    const T = 400000, prices = [0.99, 1.25, 2.5, 4.95, 9.95, 18, 25, 70, 120, 250], mk4 = () => { const x = new Float64Array(T); for (let i = 0; i < T; i++) { const u = r(); x[i] = u < 0.6 ? Math.round(Math.exp(gauss() + 2) * 100) / 100 : prices[Math.floor(Math.pow(r(), 2.2) * prices.length)]; } return x; };
    const cols = { tied: mk4(), tied2: mk4() }, ft = await J.packColumnsParallel(cols), St = J.summary(ft), St2 = (await J.open(ft)).summary();
    for (const key in cols) { const v = Float64Array.from(cols[key]).sort(), N = v.length, c = St.cols.find((x) => x.key === key);
      ok(c.qSample && c.qv && c.qv.length >= 15, key + ': tied values listed (' + (c.qv ? c.qv.length / 3 : 0) + ')');
      const cntA = (x) => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] <= x) lo = m + 1; else hi = m; } return N - lo; }, cntB = (x) => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; } return lo; };
      for (const x of prices) { const ea = cntA(x), eb = cntB(x), ga = St.countAbove(key, x), gb = St.countBelow(key, x), tail = ea < N / 91;
        ok(St2.countAbove(key, x) === ga, key + ' ' + x + ': open().summary() agrees');
        ok(tail ? ga === ea : Math.abs(ga - ea) <= N * 0.0044, key + ' countAbove(' + x + ') ' + ga + ' vs exact ' + ea + (tail ? ' (tail: exact)' : ''));
        ok(Math.abs(gb - eb) <= N * 0.0044, key + ' countBelow(' + x + ') ' + gb + ' vs exact ' + eb); }
      for (let t = 0; t < 40; t++) { const x = Math.round(Math.exp(gauss() + 2) * 100) / 100 + 0.001, ea = cntA(x), ga = St.countAbove(key, x); ok(Math.abs(ga - ea) <= N * 0.004, key + ' countAbove between values ' + x + ': ' + ga + ' vs ' + ea); } }
  }
  { // asked-for shares (qx, since 0.26.4): p95 to p99.75 and p0.25 to p5 read straight from a point; exact inside 1/90.5 of an end, else within the grid's rank error; a file read without qx answers as before
    const T = 400000, x = new Float64Array(T); for (let i = 0; i < T; i++) x[i] = Math.round(Math.exp(gauss() * 1.1 + 2) * 100) / 100;
    const f = await J.packColumnsParallel({ sk: x }), S = J.summary(f), c = S.cols[0], v = Float64Array.from(x).sort(), N = v.length;
    ok(c.qx && c.qx.length === 20, 'qx: 20 points (' + (c.qx ? c.qx.length : 0) + ')');
    const at = (p) => { const pos = p * (N - 1), lo = Math.floor(pos); return lo + 1 < N ? v[lo] + (pos - lo) * (v[lo + 1] - v[lo]) : v[lo]; };
    for (const q of [0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05]) for (const p of [q, 1 - q]) {
      const g = S.quantile('sk', p), ex = at(p), tail = q < 1 / 90.5;
      ok(tail ? Math.abs(g - ex) <= 1e-9 * Math.abs(ex) : g >= at(Math.max(0, p - 0.0044)) && g <= at(Math.min(1, p + 0.0044)), 'qx quantile(' + p + ') ' + g + ' vs exact ' + ex + (tail ? ' (exact zone)' : '')); }
    const keep = c.qx; delete c.qx; const g0 = S.quantile('sk', 0.99); c.qx = keep;
    ok(g0 >= at(0.99 - 0.0044) && g0 <= at(0.99 + 0.0044), 'without qx p99 still within the rank error: ' + g0);
  }
  { // estimate(key) and exact(key) (since 0.26.5): exact answers from the decoded column, the same as an exact sort; open().summary().exact gives a Promise of the same
    const T = 300000, x = new Float64Array(T); for (let i = 0; i < T; i++) x[i] = i % 97 === 0 ? NaN : (r() < 0.05 ? 70 : Math.round(Math.exp(gauss() + 2) * 100) / 100);
    const w = Int32Array.from({ length: T }, (_, i) => i % 5);
    const f = await J.packColumnsParallel({ x, w }), S = J.summary(f), v = Float64Array.from(x.filter((y) => y === y)).sort(), N = v.length;
    ok(S.estimate('x') === true && S.estimate('w') === false && S.estimate('nope') === null, 'estimate(): sampled true, counted false, missing null');
    const E = S.exact('x'), Ew = S.exact('w');
    ok(E.n === N && S.exact('x') === E, 'exact(): n ' + E.n + ' vs ' + N + ', kept per key');
    const at = (p) => { const pos = p * (N - 1), lo = Math.floor(pos); return lo + 1 < N ? v[lo] + (pos - lo) * (v[lo + 1] - v[lo]) : v[lo]; };
    const ca = (y) => v.length - v.findLastIndex((z) => z <= y) - 1, cb = (y) => v.findLastIndex((z) => z < y) + 1;
    for (const p of [0, 0.01, 0.25, 0.5, 0.9, 0.95, 0.99, 1]) ok(E.quantile(p) === at(p), 'exact quantile(' + p + ') ' + E.quantile(p) + ' vs ' + at(p));
    for (const y of [0.5, 5, 9.95, 70, 70.01, 150, 1e9]) { ok(E.countAbove(y) === ca(y), 'exact countAbove(' + y + ') ' + E.countAbove(y) + ' vs ' + ca(y)); ok(E.countBelow(y) === cb(y), 'exact countBelow(' + y + ')'); }
    ok(Ew.countAbove(2) === T * 2 / 5 && Ew.quantile(0.5) === 2, 'exact on a whole-number column');
    const Eo = await (await J.open(f)).summary().exact('x'); ok(Eo.countAbove(70) === ca(70) && Eo.n === N, 'open().summary().exact(): ' + Eo.countAbove(70));
  }
  console.log(bad ? bad + ' of ' + n + ' quantile checks FAILED' : 'quantile: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
