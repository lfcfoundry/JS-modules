/* Copyright (c) 2026 LFC Foundry. MIT License. Checks the distributions and the Monte Carlo walkers of walker-sim against exact answers. Run: node modules/walker-sim/test/run.js */
const S = require('../walker-sim.js');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

// 1. each distribution has the mean and variance it claims (200k draws)
const cases = [['normal', 10, 3], ['lognormal', 10, 4], ['poisson', 4.5], ['poisson', 120], ['binomial', 20, 0.3], ['binomial', 400, 0.45], ['negbinomial', 6, 5], ['geometric', 4], ['exponential', 7], ['gamma', 5, 2], ['gamma', 0.6, 0.8], ['weibull', 3, 1.7], ['beta', 0.3, 0.1], ['uniform', 2, 9], ['triangular', 1, 2, 7], ['pareto', 2, 4], ['dunif', 1, 6]];
for (const [d, a, b, c] of cases) {
  const r = S.makeRng(12345), f = S.DRAW[d], N = 200000; let s = 0, q = 0;
  for (let i = 0; i < N; i++) { const x = f(r, a, b, c); s += x; q += x * x; }
  const mean = s / N, v = q / N - mean * mean, m = S.moments(d, a, b, c);
  const tolM = 0.02 * Math.max(1, Math.abs(m.mean)) + 3 * Math.sqrt(m.variance / N), tolV = 0.06 * Math.max(0.5, m.variance) + (d === 'pareto' ? 1 : 0);
  ok(Math.abs(mean - m.mean) < tolM && Math.abs(v - m.variance) < tolV, `${d}(${a}${b !== undefined ? ',' + b : ''}${c !== undefined ? ',' + c : ''}) mean ${mean.toFixed(3)} vs ${m.mean.toFixed(3)}, variance ${v.toFixed(3)} vs ${m.variance.toFixed(3)}`);
}

// 2. walkers agree with the exact answer, and batches do not change the result
const mk = (ids, edges) => ({ start: ids[0], nodes: ids, links: edges.map(([from, to, weight]) => ({ from, to, weight })) });
const g = mk(['s', 'a', 'b', 'x', 'y', 'z'], [['s', 'a', 3], ['s', 'b', 1], ['a', 'x', 2], ['a', 'y', 2], ['b', 'y', 1], ['b', 'z', 3], ['a', 'b', 1]]);
const P = S.graph(g);
const cfg = { seed: 7, trials: 40000, rule: 'weights', weights: P.w };
const ex = S.exactEndpoints(P, cfg), sim = S.create(P, cfg); sim.run(1e9, 1e9); const r = sim.snapshot();
ok(ex && r.endpoints.length === ex.ends.length, 'same ends as the exact solver');
let worst = 0; r.endpoints.forEach((e, k) => { worst = Math.max(worst, Math.abs(e.share - ex.p[k])); ok(ex.p[k] >= e.lo - 1e-9 && ex.p[k] <= e.hi + 1e-9, `exact ${ex.p[k].toFixed(4)} inside the 95% range ${e.lo.toFixed(4)}..${e.hi.toFixed(4)} for ${e.id}`); });
ok(worst < 0.01, 'worst gap to the exact odds ' + worst.toFixed(4));
const s1 = S.create(P, cfg); while (!s1.run(137, 1e9).done); const s2 = S.create(P, cfg); s2.run(1e9, 1e9);
ok(JSON.stringify(s1.snapshot().endpoints.map(e => e.count)) === JSON.stringify(s2.snapshot().endpoints.map(e => e.count)), 'cutting the run into batches gives identical counts');

// 3. arrivals from a distribution, uncertain weights, costs
const cfg2 = { seed: 3, trials: 3000, arrivals: { dist: 'poisson', a: 12 }, linkWeight: { dist: 'gamma', a: P.w, b: Float64Array.from(P.w, w => w * 0.5) }, linkCost: { dist: 'lognormal', a: 5, b: 2 }, rule: 'weights', weights: P.w };
const s3 = S.create(P, cfg2); s3.run(1e9, 1e9); const r3 = s3.snapshot();
ok(Math.abs(r3.walkers / r3.trials - 12) < 0.3, 'Poisson arrivals average ' + (r3.walkers / r3.trials).toFixed(2) + ' walkers per trial');
ok(r3.cost && r3.cost.mean > 5 && r3.cost.p95 > r3.cost.p5, 'cost spread is reported: ' + (r3.cost ? r3.cost.p5.toFixed(1) + ' to ' + r3.cost.p95.toFixed(1) : 'none'));
ok(r3.endpoints[0].perTrial.sd > 0, 'per-trial counts vary');

// 4. sweep
const sw = S.sweep(P, cfg, { what: 'items', top: 10 });
ok(sw.ok && sw.rows.length >= 2 && sw.rows[0].shift >= sw.rows[sw.rows.length - 1].shift, 'what-if sweep ranks items; most important is ' + (sw.rows[0] && sw.rows[0].id) + ' (shift ' + (sw.rows[0] && sw.rows[0].shift.toFixed(3)) + ')');
// cap on a loop
const lg = mk(['s', 'a', 'e'], [['s', 'a', 1], ['a', 's', 9], ['a', 'e', 1]]);
const PL = S.graph(lg), sl = S.create(PL, { seed: 1, trials: 5000, rule: 'weights', weights: PL.w, stepCap: 400 }); sl.run(1e9, 1e9);
ok(sl.snapshot().endpoints[0].share > 0.99, 'walkers escape a loop');
// the normal generator (ziggurat): moments and tails of 4 million draws, and the run never repeats across trials
{
  const r = S.rngFor(7, 3), N = 4e6; let m1 = 0, m2 = 0, m4 = 0, t3 = 0, t4 = 0;
  for (let i = 0; i < N; i++) { const x = r.normal(); m1 += x; m2 += x * x; m4 += x * x * x * x; const a = Math.abs(x); if (a > 3) t3++; if (a > 4) t4++; }
  const e3 = 0.0026998 * N, e4 = 6.334e-5 * N;
  ok(Math.abs(m1 / N) < 0.004 && Math.abs(m2 / N - 1) < 0.006 && Math.abs(m4 / N - 3) < 0.05, 'normal draws: mean ' + (m1 / N).toFixed(4) + ', variance ' + (m2 / N).toFixed(4) + ', fourth moment ' + (m4 / N).toFixed(3));
  ok(Math.abs(t3 - e3) < 5 * Math.sqrt(e3) && Math.abs(t4 - e4) < 5 * Math.sqrt(e4), 'normal draws: tails beyond 3 and 4 standard deviations are ' + t3 + ' and ' + t4 + ' (expected ' + Math.round(e3) + ' and ' + Math.round(e4) + ')');
  ok(S.rngFor(7, 3).normal() === S.rngFor(7, 3).normal() && S.rngFor(7, 3).normal() !== S.rngFor(7, 4).normal(), 'normal draws repeat for the same seed and trial and differ across trials');
}
{   // the exponential ziggurat and the Poisson walk along the cumulative odds
  const r = S.makeRng(99), N = 4e6; let s = 0, q = 0, t1 = 0, t3 = 0, t8 = 0, neg = 0;
  for (let i = 0; i < N; i++) { const x = r.exponential(); s += x; q += x * x; if (x > 1) t1++; if (x > 3) t3++; if (x > 8) t8++; if (x < 0) neg++; }
  const m = s / N, v = q / N - m * m, e1 = N * Math.exp(-1), e3 = N * Math.exp(-3), e8 = N * Math.exp(-8);
  ok(Math.abs(m - 1) < 0.004 && Math.abs(v - 1) < 0.02 && neg === 0, 'exponential draws: mean ' + m.toFixed(4) + ', variance ' + v.toFixed(4));
  ok(Math.abs(t1 - e1) < 5 * Math.sqrt(e1) && Math.abs(t3 - e3) < 5 * Math.sqrt(e3) && Math.abs(t8 - e8) < 5 * Math.sqrt(e8) + 3, 'exponential draws: tails beyond 1, 3 and 8 are ' + t1 + ', ' + t3 + ', ' + t8 + ' (expected ' + Math.round(e1) + ', ' + Math.round(e3) + ', ' + Math.round(e8) + ')');
  ok(S.rngFor(7, 3).exponential() === S.rngFor(7, 3).exponential(), 'exponential draws repeat for the same seed and trial');
  for (const lam of [0.2, 1, 7, 29.5]) {
    const rp = S.makeRng(5), M = 1e6; let ps = 0, pq = 0, p0 = 0; for (let i = 0; i < M; i++) { const x = S.DRAW.poisson(rp, lam); ps += x; pq += x * x; if (x === 0) p0++; }
    const pm = ps / M, pv = pq / M - pm * pm, e0 = M * Math.exp(-lam);
    ok(Math.abs(pm - lam) < 5 * Math.sqrt(lam / M) && Math.abs(pv - lam) < 0.02 * lam + 0.01 && Math.abs(p0 - e0) < 5 * Math.sqrt(e0) + 3, 'poisson ' + lam + ': mean ' + pm.toFixed(3) + ', variance ' + pv.toFixed(3) + ', zeros ' + p0 + ' (expected ' + Math.round(e0) + ')');
  }
}

// graph(): plain input in, the compact graph out
{
  const Pg = S.graph({ links: [{ from: 'in', to: 'a', weight: 3 }, { from: 'in', to: 'b' }, { from: 'a', to: 'out', weight: -2 }, { from: 'b', to: 'out', weight: 'x' }] });
  ok(Pg.n === 4 && Pg.m === 4 && Pg.nodes.map(n => n.id).join() === 'in,a,b,out', 'items that only appear in links are added, in order of appearance');
  ok(Array.from(Pg.w).join() === '3,1,1,1', 'a missing, negative or non-numeric weight counts as 1: ' + Array.from(Pg.w));
  ok(Pg.nodes[Pg.start].id === 'in', 'the start is the item nothing points to');
  ok(S.graph({ nodes: [{ id: 'x', label: 'Ex' }, 'y'], links: [{ from: 'x', to: 'y' }], start: 'y' }).start === 1, 'a named start is used and labels are kept');
  let threw = ''; try { S.graph({ links: [{ from: 'a', to: 'b' }], start: 'nope' }); } catch (e) { threw = e.message; }
  ok(/not in the graph/.test(threw), 'an unknown start is refused in plain words: ' + threw);
  threw = ''; try { S.graph({ links: [{ from: '__proto__', to: 'b' }] }); } catch (e) { threw = e.message; }
  ok(/cannot be used/.test(threw), 'a name that could poison an object is refused');
  const Pd = S.graph({ links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'c', to: 'd' }] }), sd = S.create(Pd, { seed: 1, trials: 4000 }); sd.run(1e9, 1e9);
  const shares = sd.snapshot().endpoints.map(e => e.share); ok(Math.abs(shares[0] - 0.5) < 0.03 && Math.abs(shares[0] + shares[1] - 1) < 1e-9, 'a fair fork splits about half and half: ' + shares.map(x => x.toFixed(3)));
  ok(S.exactEndpoints(Pd, {}).p.every(p => Math.abs(p - 0.5) < 1e-12), 'the exact odds of the fair fork are exactly half each');
}
console.log(bad ? bad + ' FAILED' : 'walker-sim: all passed'); process.exit(bad ? 1 : 0);
