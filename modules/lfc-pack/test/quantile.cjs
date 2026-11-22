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
  console.log(bad ? bad + ' of ' + n + ' quantile checks FAILED' : 'quantile: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
