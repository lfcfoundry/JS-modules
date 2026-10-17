/* Copyright (c) 2026 LFC Foundry. MIT License. Checks the distributions and the Monte Carlo walkers of walker-sim against exact answers. Run: node modules/walker-sim/test/run.js [walker-sim.min.js] */
const path = require('path');
const S = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'walker-sim.js')));   // another copy (for example walker-sim.min.js) can be given as the first argument
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

// ---- 2.0.0 ----
const mkg = (n, edges, start) => S.graph({ links: edges.map(([from, to, weight]) => ({ from, to, weight })), start });
const run = (P, cfg) => { const q = S.create(P, cfg); q.run(1e9, 1e9); return q; };

// an item whose ways on all weigh 0 has no way on: the walkers stop there, as the exact solver says
{
  const Pz = mkg(0, [['s', 'a', 1], ['s', 'b', 1], ['a', 'x', 1], ['a', 'y', 1], ['b', 'z', 1]], 's');
  const wz = Float64Array.from(Pz.w); for (let e = 0; e < Pz.m; e++) if (Pz.nodes[Pz.from[e]].id === 'a') wz[e] = 0;
  const cz = { seed: 4, trials: 400, arrivals: { dist: 'fixed', a: 100 }, rule: 'weights', weights: wz }, rz = run(Pz, cz).snapshot(), exz = S.exactEndpoints(Pz, cz);
  const share = id => rz.endpoints.find(e => e.id === id).share;
  ok(Math.abs(rz.stuckShare - 0.5) < 0.02 && share('x') === 0 && share('y') === 0 && Math.abs(exz.stuck - 0.5) < 1e-12 && Math.abs(share('z') - exz.p[exz.ends.map(v => Pz.nodes[v].id).indexOf('z')]) < 0.02,
    'walkers stop at an item whose ways on all weigh 0: stuck ' + rz.stuckShare.toFixed(3) + ' (exact ' + exz.stuck.toFixed(3) + '), x and y get none');
}
// the exact solver goes round a loop until it settles, or solves it directly, and says which
{
  const Pl = mkg(0, [['s', 'a', 1], ['a', 's', 9999], ['a', 'e', 1]], 's'), xl = S.exactEndpoints(Pl, { rule: 'weights', weights: Pl.w });
  ok(xl.converged && Math.abs(xl.p[0] - 1) < 1e-9 && xl.error < 1e-9, 'a loop that needs about 20,000 rounds still gives exactly 1: ' + xl.p[0] + ' (' + xl.method + ', error ' + xl.error.toExponential(1) + ')');
  const Pc = mkg(0, [['s', 'a', 1], ['s', 'e', 1], ['a', 'b', 1], ['b', 'a', 1]], 's'), xc = S.exactEndpoints(Pc, { rule: 'weights', weights: Pc.w });
  ok(Math.abs(xc.p[0] - 0.5) < 1e-12 && Math.abs(xc.stuck - 0.5) < 1e-12 && xc.converged, 'a loop with no way out holds half the walkers: ends ' + xc.p[0] + ', stuck ' + xc.stuck);
  // 30 random loopy networks against walking the chain forward one step at a time
  let seedv = 11; const rnd = () => (seedv = (Math.imul(seedv, 1664525) + 1013904223) >>> 0) / 4294967296; let worstL = 0, methods = new Set();
  for (let t = 0; t < 12; t++) {
    const nT = 8 + Math.floor(rnd() * 25), nE = 2 + Math.floor(rnd() * 4), links = [];
    for (let i = 0; i < nT; i++) { const d = 1 + Math.floor(rnd() * 3); for (let q = 0; q < d; q++) links.push({ from: 't' + i, to: rnd() < 0.15 ? 'e' + Math.floor(rnd() * nE) : 't' + Math.floor(rnd() * nT), weight: 1 + Math.floor(rnd() * 9) }); }
    for (let q = 0; q < nE; q++) links.push({ from: 't0', to: 'e' + q, weight: 0.01 });
    const Pr = S.graph({ links, start: 't0' }), xr = S.exactEndpoints(Pr, { rule: 'weights', weights: Pr.w });
    let x = new Float64Array(Pr.n), y = new Float64Array(Pr.n); x[Pr.start] = 1; const res = new Float64Array(Pr.n), sw = new Float64Array(Pr.n);
    for (let e = 0; e < Pr.m; e++) sw[Pr.from[e]] += Pr.w[e];
    for (let it = 0; it < 200000; it++) {
      y.fill(0); let live = 0;
      for (let v = 0; v < Pr.n; v++) { if (!x[v]) continue; const a = Pr.outStart[v], b = Pr.outStart[v + 1]; if (a === b) { res[v] += x[v]; continue; } for (let k = a; k < b; k++) { const e = Pr.outEdge[k]; y[Pr.to[e]] += x[v] * Pr.w[e] / sw[v]; } live += x[v]; }
      const tmp = x; x = y; y = tmp; if (live < 1e-15) break;
    }
    xr.ends.forEach((v, k) => { worstL = Math.max(worstL, Math.abs(res[v] - xr.p[k])); }); methods.add(xr.method);
  }
  ok(worstL < 1e-9, '12 loopy networks: the exact odds match walking the chain forward, worst gap ' + worstL.toExponential(1));
}
// every walker's step count is kept (no 100,000-sample limit), and the exact average steps and cost can be compared with
{
  const cs = { seed: 9, trials: 3000, arrivals: { dist: 'fixed', a: 100 }, rule: 'weights', weights: P.w, linkCost: { dist: 'lognormal', a: 5, b: 2 }, dwell: { dist: 'exponential', a: 3 } };
  const q = run(P, cs), rs = q.snapshot(), exs = S.exactEndpoints(P, cs);
  ok(rs.walkers === 300000 && rs.steps.bins.reduce((a, b) => a + b, 0) === 300000, 'the step table holds all 300,000 walkers, not a sample of 100,000');
  const se = Math.sqrt(rs.cost.sd * rs.cost.sd / rs.cost.n);
  ok(Math.abs(rs.stepStats.mean - exs.meanSteps) < 0.02 && exs.meanCost !== null && Math.abs(rs.cost.mean - exs.meanCost) < 4 * se + 0.05, `exact average steps ${exs.meanSteps.toFixed(4)} (simulated ${rs.stepStats.mean.toFixed(4)}) and cost ${exs.meanCost.toFixed(3)} (simulated ${rs.cost.mean.toFixed(3)} ± ${se.toFixed(3)})`);
  ok(S.exactEndpoints(P, { rule: 'weights', weights: P.w }).meanCost === null && S.exactEndpoints(P, { rule: 'weights', weights: P.w, dwell: { dist: 'pareto', a: 1, b: 0.5 } }).meanCost === null, 'no cost set means no exact cost; a distribution with no average (pareto, shape 0.5) gives null, not a wrong number');
  ok(Math.abs(S.exactEndpoints(P, { rule: 'weights', weights: P.w, linkCost: { dist: 'fixed', a: 2 } }).meanCost - 2 * S.exactEndpoints(P, { rule: 'weights', weights: P.w }).meanSteps) < 1e-9, 'a fixed cost of 2 per step costs exactly twice the steps');
}
// runs can be split across threads: the same trials in any order, in any number of pieces, count the same
{
  const full = { seed: 21, trials: 4000, arrivals: { dist: 'poisson', a: 12 }, linkWeight: { dist: 'gamma', a: P.w, b: Float64Array.from(P.w, w => w * 0.5) }, linkCost: { dist: 'lognormal', a: 5, b: 2 }, rule: 'weights', weights: P.w };
  const whole = run(P, full), parts = [[0, 1500], [1500, 2600], [2600, 4000]].map(([a, b]) => run(P, Object.assign({}, full, { firstTrial: a, trials: b })).export());
  const merged = S.merge(P, full, parts.slice().reverse()), A = whole.snapshot(), B = merged.snapshot();
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  ok(A.walkers === B.walkers && A.stuck === B.stuck && A.trials === B.trials && same(A.endpoints.map(e => e.count), B.endpoints.map(e => e.count)) && same(A.endpoints.map(e => e.perTrial.p50), B.endpoints.map(e => e.perTrial.p50)) && same(A.endpoints.map(e => e.perTrial.p95), B.endpoints.map(e => e.perTrial.p95)),
    'three pieces added up in reverse order give the same walkers, stuck, end counts and per-trial percentiles as one run (' + A.walkers + ' walkers)');
  ok(same(A.stepStats, B.stepStats) && same(A.steps, B.steps) && same(Array.from(A.visits), Array.from(B.visits)) && same(Array.from(A.moves), Array.from(B.moves)), 'step counts, visits and moves are identical too');
  let dv = 0; A.endpoints.forEach((e, k) => { dv = Math.max(dv, Math.abs(e.lo - B.endpoints[k].lo), Math.abs(e.hi - B.endpoints[k].hi)); }); ok(dv < 1e-12, 'the 95% ranges agree to ' + dv.toExponential(1) + ' (the sums of shares add in another order)');
  ok(Math.abs(A.cost.mean - B.cost.mean) < 0.05 * A.cost.mean, 'cost samples are thinned in their own order, so the cost average agrees only closely: ' + A.cost.mean.toFixed(3) + ' and ' + B.cost.mean.toFixed(3));
}
// stop when precise enough
{
  const cp = { seed: 3, trials: 100000, arrivals: { dist: 'fixed', a: 100 }, rule: 'weights', weights: P.w, precision: 0.005 };
  const rp = run(P, cp).snapshot(), half = Math.max.apply(null, rp.endpoints.map(e => (e.hi - e.lo) / 2));
  ok(rp.stoppedEarly && rp.trials < 100000 && rp.walkers >= 2000 && half < 0.005, `with precision 0.005 the run stopped after ${rp.trials} of ${rp.planned} trials (${rp.walkers} walkers), widest half-range ${half.toFixed(4)}`);
  const sl = S.create(P, cp); while (!sl.run(7, 1e9).done); ok(sl.snapshot().trials === rp.trials && JSON.stringify(sl.snapshot().endpoints.map(e => e.count)) === JSON.stringify(rp.endpoints.map(e => e.count)), 'it stops at the same trial however the run is cut into slices');
  const rnone = run(P, Object.assign({}, cp, { precision: 0, trials: 300 })).snapshot(); ok(!rnone.stoppedEarly && rnone.trials === 300, 'without precision it runs the whole plan');
}
// the what-if sweep starts from the full answer; it must not carry stale answers into a loop that has just been closed
{
  const Pt = mkg(0, [['s', 'a', 1], ['a', 'b', 1], ['b', 'a', 1], ['b', 'e', 1], ['a', 'e', 1]], 's'), ct = { rule: 'weights', weights: Pt.w };
  const swt = S.sweep(Pt, ct, { what: 'links', top: 10 }), closes = swt.rows.filter(r => r.to === 'e');
  ok(swt.converged && closes.length === 2, 'the sweep reports whether it settled');
  const both = S.exactEndpoints(Pt, { rule: 'weights', weights: Float64Array.from(Pt.w, (w, e) => Pt.nodes[Pt.to[e]].id === 'e' ? 0 : w) });
  ok(both.p[0] === 0 && Math.abs(both.stuck - 1) < 1e-12, 'with both ways out gone the exact answer is 0 ends, all stuck');
  const swi = S.sweep(Pt, ct, { what: 'items', top: 10 }); ok(swi.rows.every(r => r.after.every(Number.isFinite)), 'sweep rows are numbers');
  const Pg2 = mkg(0, [['s', 'a', 3], ['s', 'b', 1], ['a', 'x', 2], ['a', 'y', 2], ['b', 'y', 1], ['b', 'z', 3], ['a', 'b', 1]], 's');
  const cg = { rule: 'weights', weights: Pg2.w }, swg = S.sweep(Pg2, cg, { what: 'items', top: 10 });
  let off = 0;
  swg.rows.forEach(row => { const w2 = Float64Array.from(Pg2.w); for (let e = 0; e < Pg2.m; e++) if (Pg2.nodes[Pg2.to[e]].id === row.id) w2[e] = 0; const x2 = S.exactEndpoints(Pg2, { rule: 'weights', weights: w2 }); row.after.forEach((v, k) => { if (Math.abs(v - x2.p[k]) > 1e-10) off++; }); });
  ok(swg.rows.length >= 2 && off === 0, 'every sweep row (' + swg.rows.length + ') equals a fresh exact solve of the network without that item');
}
// the 'curious' rule is repeatable and every walker finishes
{
  const pc = run(P, { seed: 2, trials: 200, rule: 'curious', weights: P.w, arrivals: { dist: 'fixed', a: 50 } }).snapshot(), pc2 = run(P, { seed: 2, trials: 200, rule: 'curious', weights: P.w, arrivals: { dist: 'fixed', a: 50 } }).snapshot();
  ok(pc.walkers === 10000 && JSON.stringify(pc.endpoints.map(e => e.count)) === JSON.stringify(pc2.endpoints.map(e => e.count)) && pc.endpoints.reduce((a, e) => a + e.count, 0) + pc.stuck === 10000, 'the curious rule: repeatable, and every walker is an end or stuck');
  const pf = run(P, { seed: 2, trials: 100, rule: 'first', weights: P.w, arrivals: { dist: 'fixed', a: 50 } }).snapshot(); ok(pf.endpoints.reduce((a, e) => a + e.count, 0) + pf.stuck === 5000, 'the first rule runs');
}
// the menu of distribution names is a separate file
{
  ok(S.DISTS === undefined && S.DRAW.poisson && S.DRAW.normal, 'the core has the random numbers and no menu text');
  const menuFile = path.join(path.dirname(path.resolve(process.argv[2] || path.join(__dirname, '..', 'walker-sim.js'))), 'walker-sim-menu.js');
  delete require.cache[require.resolve(menuFile)]; const M = require(menuFile);
  ok(M.DISTS.length === 16 && M.DIST_BY.poisson.discrete === true && M.DISTS.every(d => S.DRAW[d.id] || d.id === 'empirical'), 'walker-sim-menu.js adds DISTS and DIST_BY: ' + M.DISTS.length + ' kinds, each with a draw function');
}
// real threads: two worker_threads each run half the trials, the exports travel by structured clone, and the sum equals one run
(async () => {
  const { Worker } = require('worker_threads'), file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'walker-sim.js'));
  const wcfg = { seed: 21, trials: 3000, rule: 'weights', arrivals: { dist: 'fixed', a: 100 } }, links = P.edges.map(e => ({ from: e.from, to: e.to, weight: e.weight })), done = [];
  const code = 'const { parentPort, workerData: d } = require("worker_threads"); const S = require(d.file); const P = S.graph({ links: d.links, start: "s" }); const q = S.create(P, Object.assign({ weights: P.w }, d.cfg)); q.run(1e9, 1e9); parentPort.postMessage(q.export());';
  await Promise.all([[0, 1500], [1500, 3000]].map(([a, b]) => new Promise((res, rej) => { const w = new Worker(code, { eval: true, workerData: { file, links, cfg: Object.assign({}, wcfg, { firstTrial: a, trials: b }) } }); w.on('message', x => { done.push([a, x]); res(); }); w.on('error', rej); })));
  const one = run(P, Object.assign({ weights: P.w }, wcfg)).snapshot(), joined = S.merge(P, Object.assign({ weights: P.w }, wcfg), done.sort((x, y) => x[0] - y[0]).map(x => x[1])).snapshot();
  ok(JSON.stringify(one.endpoints.map(e => e.count)) === JSON.stringify(joined.endpoints.map(e => e.count)) && one.walkers === joined.walkers, 'two worker threads, each half of the trials, add up to the counts of one run (' + one.walkers + ' walkers)');
})().catch(e => ok(false, 'worker threads: ' + e)).then(() => { console.log(bad ? bad + ' FAILED' : 'walker-sim: all passed'); process.exit(bad ? 1 : 0); });
